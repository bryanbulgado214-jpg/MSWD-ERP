import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { AutoJevService } from './auto-jev.service';
import { CollectionDepositService } from './collection-deposit.service';

// Money is accumulated in integer centavos to avoid floating-point drift, then
// converted back to a 2-decimal number only at the edges.
const toCents = (v: unknown) => Math.round(Number(v) * 100);
const toPeso = (c: number) => c / 100;

type EntryLine = {
  chartOfAccountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

/**
 * Daily Collection Accounting Batch — consolidates a day's receipts, proposes
 * the summarized journal entry from the actual payment allocations + collection
 * mappings, and (on FINALIZE) auto-generates and posts ONE collection JEV to the
 * GL. Individual receipts stay in the collection subledger; Accounting receives
 * a summarized daily batch with full drill-down.
 */
@Injectable()
export class CollectionBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
    private readonly deposits: CollectionDepositService,
  ) {}

  async list(orgId: string, filters: { status?: string; dateFrom?: string; dateTo?: string }) {
    const batches = await this.prisma.collectionAccountingBatch.findMany({
      where: {
        organizationId: orgId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              collectionDate: {
                ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
                ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { collectionDate: 'desc' },
    });
    return batches;
  }

  /**
   * Build (or refresh) the collection batch for a date from every valid payment
   * of that day not already tied to a posted batch. Idempotent: re-running on an
   * un-posted batch just recomputes it; a posted batch is returned untouched.
   */
  async consolidate(orgId: string, userId: string, dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) throw new BadRequestException('Invalid collection date.');

    const existing = await this.prisma.collectionAccountingBatch.findFirst({
      where: { organizationId: orgId, collectionDate: date },
    });
    if (existing && existing.status === 'posted') {
      return existing;
    }

    // Valid receipts for the day that aren't locked into another posted batch.
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId: orgId,
        paymentDate: date,
        status: 'valid',
        ...(existing ? {} : { collectionBatchId: null }),
      },
      select: { id: true, orNumber: true, totalAmount: true, paymentMethod: true },
      orderBy: { orNumber: 'asc' },
    });

    const voided = await this.prisma.payment.count({
      where: { organizationId: orgId, paymentDate: date, status: 'voided' },
    });

    const byMethod: Record<string, number> = {
      cash: 0,
      check: 0,
      online: 0,
      bank_deposit: 0,
    };
    let grossCents = 0;
    for (const p of payments) {
      const c = toCents(p.totalAmount);
      grossCents += c;
      byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] ?? 0) + c;
    }

    const data = {
      collectionDate: date,
      cashierId: userId,
      status: 'for_review' as const,
      beginningOrNumber: payments[0]?.orNumber ?? null,
      endingOrNumber: payments[payments.length - 1]?.orNumber ?? null,
      transactionCount: payments.length,
      grossCollections: toPeso(grossCents),
      cashAmount: toPeso(byMethod.cash ?? 0),
      checkAmount: toPeso(byMethod.check ?? 0),
      onlineAmount: toPeso(byMethod.online ?? 0),
      bankTransferAmount: toPeso(byMethod.bank_deposit ?? 0),
      otherAmount: 0,
      totalCollections: toPeso(grossCents),
      voidedReceiptCount: voided,
      preparedBy: userId,
      preparedAt: new Date(),
    };

    return runAudited(this.prisma, userId, async (tx) => {
      let batch;
      if (existing) {
        batch = await tx.collectionAccountingBatch.update({
          where: { id: existing.id },
          data,
        });
      } else {
        const seq = await tx.collectionAccountingBatch.count({
          where: { organizationId: orgId, collectionDate: date },
        });
        const batchNumber = `COL-${dateStr.replace(/-/g, '')}-${String(seq + 1).padStart(3, '0')}`;
        batch = await tx.collectionAccountingBatch.create({
          data: { organizationId: orgId, batchNumber, ...data },
        });
      }
      // Tie every consolidated receipt to this batch.
      await tx.payment.updateMany({
        where: { id: { in: payments.map((p) => p.id) } },
        data: { collectionBatchId: batch.id },
      });
      return batch;
    });
  }

  async getDetail(orgId: string, id: string) {
    const batch = await this.prisma.collectionAccountingBatch.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!batch) throw new NotFoundException('Collection batch not found.');
    const entry = await this.computeEntry(orgId, id);
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, collectionBatchId: id },
      select: {
        id: true,
        orNumber: true,
        paymentDate: true,
        totalAmount: true,
        paymentMethod: true,
        status: true,
        payerName: true,
        consumer: { select: { accountNumber: true, firstName: true, lastName: true } },
      },
      orderBy: { orNumber: 'asc' },
    });
    const deposit =
      batch.status === 'posted' ? await this.deposits.summaryForBatch(orgId, id) : null;
    return { batch, entry, payments, deposit };
  }

  /**
   * FINALIZE: validate and auto-post the summarized collection JEV, then lock the
   * batch. Idempotent — a batch already posted is refused, and the post happens
   * in one transaction so a retry can never create a duplicate JEV.
   */
  async finalize(orgId: string, userId: string, id: string) {
    const batch = await this.prisma.collectionAccountingBatch.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!batch) throw new NotFoundException('Collection batch not found.');
    if (batch.status === 'posted' || batch.jevId) {
      throw new ConflictException('This batch has already been posted to the GL.');
    }

    const entry = await this.computeEntry(orgId, id);
    if (entry.unmappedTypes.length > 0) {
      throw new BadRequestException(
        `Posting blocked: ${entry.unmappedTypes.length} collection type(s) have no GL account — ` +
          entry.unmappedTypes.map((t) => t.name).join(', '),
      );
    }
    if (entry.lines.length === 0 || entry.totalDebit <= 0) {
      throw new BadRequestException('Nothing to post — the batch has no valid collections.');
    }
    if (!entry.balanced) {
      throw new BadRequestException(
        `Refusing to post an unbalanced entry (debit ${entry.totalDebit} ≠ credit ${entry.totalCredit}).`,
      );
    }

    return runAudited(this.prisma, userId, async (tx) => {
      // Re-read under the transaction so a concurrent finalize cannot double-post.
      const fresh = await tx.collectionAccountingBatch.findUniqueOrThrow({ where: { id } });
      if (fresh.status === 'posted' || fresh.jevId) {
        throw new ConflictException('This batch has already been posted to the GL.');
      }

      const jev = await this.autoJev.createAutoJev(tx, {
        organizationId: orgId,
        userId,
        jevDate: batch.collectionDate,
        sourceType: 'collection',
        sourceTable: 'collection_accounting_batches',
        sourceId: batch.id,
        particulars: `To record collections for ${batch.collectionDate.toISOString().slice(0, 10)} (${batch.batchNumber})`,
        lines: entry.lines.map((l) => ({
          chartOfAccountId: l.chartOfAccountId,
          debitAmount: l.debit,
          creditAmount: l.credit,
          description: l.debit > 0 ? 'Daily collections' : 'Settled by daily collections',
        })),
      });
      if (!jev) {
        throw new BadRequestException(
          'No open accounting period for the collection date — cannot post.',
        );
      }

      return tx.collectionAccountingBatch.update({
        where: { id },
        data: {
          status: 'posted',
          postedBy: userId,
          postedAt: new Date(),
          jevId: jev.id,
        },
      });
    });
  }

  /**
   * Aggregate the batch's receipts into the proposed journal entry: debit the
   * cash account for each payment method, credit A/R for bill settlements and the
   * mapped income/liability account for each fee/deposit type. Returns the lines,
   * a balanced flag, and any collection types blocking the post for lack of a GL
   * account — used both for the review screen and by finalize.
   */
  private async computeEntry(orgId: string, batchId: string) {
    const [collectingOfficer, cashInBank, arAccount] = await Promise.all([
      this.mapping(orgId, 'cash.collecting_officer'),
      this.mapping(orgId, 'cash.in_bank'),
      this.mapping(orgId, 'ar.trade_receivable'),
    ]);
    const types = await this.prisma.collectionType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, nature: true, glAccountId: true },
    });
    const typeById = new Map(types.map((t) => [t.id, t]));

    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, collectionBatchId: batchId, status: 'valid' },
      select: {
        paymentMethod: true,
        allocations: { select: { billId: true, collectionTypeId: true, amountApplied: true } },
      },
    });

    const debitCents = new Map<string, number>();
    const creditCents = new Map<string, number>();
    const unmapped = new Map<string, { name: string }>();
    const bump = (m: Map<string, number>, key: string, c: number) =>
      m.set(key, (m.get(key) ?? 0) + c);

    for (const p of payments) {
      const debitAccountId =
        p.paymentMethod === 'online' || p.paymentMethod === 'bank_deposit'
          ? cashInBank
          : collectingOfficer;
      for (const a of p.allocations) {
        const cents = toCents(a.amountApplied);
        if (cents <= 0) continue;
        // Credit side: a bill settles A/R; a collection type uses its mapping.
        let creditAccountId: string | null = null;
        if (a.billId) {
          creditAccountId = arAccount;
        } else if (a.collectionTypeId) {
          const t = typeById.get(a.collectionTypeId);
          if (!t) continue;
          if (!t.glAccountId) {
            unmapped.set(t.id, { name: t.name });
            continue;
          }
          creditAccountId = t.glAccountId;
        }
        if (!debitAccountId || !creditAccountId) continue;
        bump(debitCents, debitAccountId, cents);
        bump(creditCents, creditAccountId, cents);
      }
    }

    // Resolve account codes/names for display.
    const ids = [...new Set([...debitCents.keys(), ...creditCents.keys()])];
    const accounts = ids.length
      ? await this.prisma.chartOfAccount.findMany({
          where: { id: { in: ids } },
          select: { id: true, accountCode: true, name: true },
        })
      : [];
    const acctById = new Map(accounts.map((a) => [a.id, a]));
    const line = (id: string, debit: number, credit: number): EntryLine => ({
      chartOfAccountId: id,
      accountCode: acctById.get(id)?.accountCode ?? '?',
      accountName: acctById.get(id)?.name ?? '?',
      debit: toPeso(debit),
      credit: toPeso(credit),
    });

    const lines: EntryLine[] = [
      ...[...debitCents.entries()].map(([id, c]) => line(id, c, 0)),
      ...[...creditCents.entries()].map(([id, c]) => line(id, 0, c)),
    ].sort((a, b) => b.debit - a.debit || a.accountCode.localeCompare(b.accountCode));

    const totalDebitCents = [...debitCents.values()].reduce((s, c) => s + c, 0);
    const totalCreditCents = [...creditCents.values()].reduce((s, c) => s + c, 0);

    return {
      lines,
      totalDebit: toPeso(totalDebitCents),
      totalCredit: toPeso(totalCreditCents),
      balanced: totalDebitCents === totalCreditCents,
      unmappedTypes: [...unmapped.entries()].map(([id, v]) => ({ id, name: v.name })),
    };
  }

  private async mapping(orgId: string, key: string) {
    const m = await this.prisma.accountMapping.findFirst({
      where: { organizationId: orgId, mappingKey: key, isActive: true },
      select: { chartOfAccountId: true },
    });
    return m?.chartOfAccountId ?? null;
  }
}
