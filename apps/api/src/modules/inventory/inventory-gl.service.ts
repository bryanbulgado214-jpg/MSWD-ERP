import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** UTC month window [start, nextMonthStart) for a period. */
function monthWindow(month: number, year: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
    lastDay: new Date(Date.UTC(year, month, 0)),
    label: `${year}-${String(month).padStart(2, '0')}`,
  };
}

/**
 * The month-end inventory GL run — the RSMI issuance JEV the stock-card
 * personnel triggers. Issuances accumulate in the perpetual stock-card
 * sub-ledger through the month (no GL); this batches them into ONE JEV
 * (Dr supplies expense / Cr inventory) and marks the entries as journalized.
 */
@Injectable()
export class InventoryGlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  /** Pending (not-yet-journalized) issue entries for a month, with item info. */
  private async pendingIssues(organizationId: string, month: number, year: number) {
    const { start, end } = monthWindow(month, year);
    return this.prisma.stockCardEntry.findMany({
      where: {
        entryType: 'issue',
        glRunId: null,
        entryDate: { gte: start, lt: end },
        stockCard: { organizationId },
      },
      select: {
        id: true,
        entryDate: true,
        referenceNumber: true,
        issueQuantity: true,
        issueTotalCost: true,
        stockCard: {
          select: {
            stockNumber: true,
            description: true,
            inventoryItem: { select: { classification: true, accountCode: true } },
          },
        },
      },
      orderBy: { entryDate: 'asc' },
    });
  }

  /** The month-end accounting period, with its open/locked state (for gating). */
  private async periodFor(organizationId: string, lastDay: Date) {
    return this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId },
        startDate: { lte: lastDay },
        endDate: { gte: lastDay },
      },
      select: { id: true, name: true, status: true, lockedAt: true },
    });
  }

  async list(organizationId: string) {
    return this.prisma.inventoryGlRun.findMany({
      where: { organizationId },
      select: {
        id: true,
        runNumber: true,
        periodMonth: true,
        periodYear: true,
        status: true,
        totalAmount: true,
        issueCount: true,
        jevId: true,
        postedAt: true,
        version: true,
        jev: { select: { jevNumber: true } },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  /** Preview the month-end JEV: per-item issuance totals + the RSMI backing list. */
  async preview(organizationId: string, month: number, year: number) {
    const { lastDay, label } = monthWindow(month, year);
    const entries = await this.pendingIssues(organizationId, month, year);

    // Per-item roll-up for the summary; keep the raw list as the RSMI backing.
    const byItem = new Map<
      string,
      {
        stockNumber: string;
        description: string;
        classification: string;
        quantity: number;
        totalCost: number;
      }
    >();
    for (const e of entries) {
      const key = e.stockCard.stockNumber;
      const row = byItem.get(key) ?? {
        stockNumber: e.stockCard.stockNumber,
        description: e.stockCard.description,
        classification: e.stockCard.inventoryItem.classification,
        quantity: 0,
        totalCost: 0,
      };
      row.quantity += Number(e.issueQuantity ?? 0);
      row.totalCost = round2(row.totalCost + Number(e.issueTotalCost ?? 0));
      byItem.set(key, row);
    }

    const existingRun = await this.prisma.inventoryGlRun.findUnique({
      where: {
        organizationId_periodMonth_periodYear: {
          organizationId,
          periodMonth: month,
          periodYear: year,
        },
      },
      select: {
        id: true,
        runNumber: true,
        status: true,
        jevId: true,
        jev: { select: { jevNumber: true } },
      },
    });
    const period = await this.periodFor(organizationId, lastDay);

    const pendingTotal = round2(entries.reduce((s, e) => s + Number(e.issueTotalCost ?? 0), 0));

    return {
      periodMonth: month,
      periodYear: year,
      periodLabel: label,
      pendingCount: entries.length,
      pendingTotal,
      items: [...byItem.values()].sort((a, b) => a.stockNumber.localeCompare(b.stockNumber)),
      rsmi: entries.map((e) => ({
        entryDate: e.entryDate,
        risNumber: e.referenceNumber,
        stockNumber: e.stockCard.stockNumber,
        description: e.stockCard.description,
        quantity: Number(e.issueQuantity ?? 0),
        totalCost: Number(e.issueTotalCost ?? 0),
      })),
      existingRun,
      period: period
        ? { status: period.status, locked: period.lockedAt != null, name: period.name }
        : null,
    };
  }

  /** Post the month-end issuance JEV. Fails loudly if the period is closed/locked. */
  async post(organizationId: string, userId: string, month: number, year: number) {
    const { lastDay, label } = monthWindow(month, year);

    const existing = await this.prisma.inventoryGlRun.findUnique({
      where: {
        organizationId_periodMonth_periodYear: {
          organizationId,
          periodMonth: month,
          periodYear: year,
        },
      },
    });
    if (existing && existing.status === 'posted') {
      throw new BadRequestException(`The month-end inventory JEV for ${label} is already posted.`);
    }

    const entries = await this.pendingIssues(organizationId, month, year);
    if (entries.length === 0) {
      throw new BadRequestException(`No un-posted issuances found for ${label}.`);
    }

    // Loud period gate (unlike the silent auto-JEV skip): the stock-card
    // personnel must know when the period is closed or locked.
    const period = await this.periodFor(organizationId, lastDay);
    if (!period) {
      throw new BadRequestException(
        `No accounting period covers ${label}. Set up the period first.`,
      );
    }
    if (period.status !== 'open') {
      throw new BadRequestException(`Cannot post: the accounting period for ${label} is closed.`);
    }
    if (period.lockedAt) {
      throw new BadRequestException(`Cannot post: the accounting period for ${label} is locked.`);
    }

    const runNumber = `RSMI-${label}`;
    const issues = entries.map((e) => ({
      totalCost: Number(e.issueTotalCost ?? 0),
      accountCode: e.stockCard.inventoryItem.accountCode,
      classification: e.stockCard.inventoryItem.classification,
    }));
    const pendingIds = entries.map((e) => e.id);
    const total = round2(issues.reduce((s, i) => s + i.totalCost, 0));

    return runAudited(this.prisma, userId, async (tx) => {
      // Reuse the period's run row if a prior one was voided; else create it.
      const run = existing
        ? await tx.inventoryGlRun.update({
            where: { id: existing.id },
            data: {
              status: 'draft',
              jevId: null,
              voidedBy: null,
              voidedAt: null,
              createdBy: userId,
            },
          })
        : await tx.inventoryGlRun.create({
            data: {
              organizationId,
              runNumber,
              periodMonth: month,
              periodYear: year,
              status: 'draft',
              createdBy: userId,
            },
          });
      if (existing) {
        await tx.inventoryGlRunItem.deleteMany({ where: { inventoryGlRunId: run.id } });
      }

      const jev = await this.autoJev.onInventoryIssuancesPosted(tx, organizationId, userId, {
        id: run.id,
        runNumber,
        periodMonth: month,
        periodYear: year,
        issues,
      });
      if (!jev) {
        throw new BadRequestException(`Nothing to post for ${label}.`);
      }

      await tx.stockCardEntry.updateMany({
        where: { id: { in: pendingIds } },
        data: { glRunId: run.id },
      });

      // Mirror the JEV lines onto the run for its own audit trail.
      const lines = await tx.jevLine.findMany({
        where: { jevId: jev.id },
        select: { chartOfAccountId: true, debitAmount: true, creditAmount: true },
      });
      await tx.inventoryGlRunItem.createMany({
        data: lines.map((l) => ({
          inventoryGlRunId: run.id,
          chartOfAccountId: l.chartOfAccountId,
          side: Number(l.debitAmount) > 0 ? 'debit' : 'credit',
          amount: Number(l.debitAmount) > 0 ? l.debitAmount : l.creditAmount,
        })),
      });

      return tx.inventoryGlRun.update({
        where: { id: run.id },
        data: {
          status: 'posted',
          jevId: jev.id,
          totalAmount: total,
          issueCount: pendingIds.length,
          postedBy: userId,
          postedAt: new Date(),
          version: { increment: 1 },
        },
        select: {
          id: true,
          runNumber: true,
          periodMonth: true,
          periodYear: true,
          status: true,
          totalAmount: true,
          issueCount: true,
          jevId: true,
          jev: { select: { jevNumber: true } },
          version: true,
        },
      });
    });
  }

  /** Void a posted run: reverse the JEV and release its issuances to be re-run. */
  async void(organizationId: string, userId: string, id: string, expectedVersion: number) {
    const run = await this.prisma.inventoryGlRun.findFirst({
      where: { id, organizationId },
      include: { jev: { include: { accountingPeriod: true } } },
    });
    if (!run) throw new NotFoundException('Inventory GL run not found.');
    if (run.status !== 'posted') {
      throw new BadRequestException('Only a posted run can be voided.');
    }
    if (run.version !== expectedVersion) {
      throw new ConflictException('Run was modified by another user. Please refresh.');
    }
    if (run.jev?.accountingPeriod) {
      if (run.jev.accountingPeriod.status !== 'open') {
        throw new BadRequestException('Cannot void: the accounting period is closed.');
      }
      if (run.jev.accountingPeriod.lockedAt) {
        throw new BadRequestException('Cannot void: the accounting period is locked.');
      }
    }

    return runAudited(this.prisma, userId, async (tx) => {
      if (run.jevId) {
        await tx.journalEntryVoucher.update({
          where: { id: run.jevId },
          data: {
            status: 'voided',
            voidedBy: userId,
            voidedAt: new Date(),
            voidReason: `Inventory month-end run ${run.runNumber} voided`,
            updatedBy: userId,
          },
        });
      }
      // Release the issuances so a corrected run can pick them up.
      await tx.stockCardEntry.updateMany({
        where: { glRunId: run.id },
        data: { glRunId: null },
      });
      return tx.inventoryGlRun.update({
        where: { id: run.id },
        data: {
          status: 'voided',
          voidedBy: userId,
          voidedAt: new Date(),
          version: { increment: 1 },
        },
        select: { id: true, status: true, version: true },
      });
    });
  }
}
