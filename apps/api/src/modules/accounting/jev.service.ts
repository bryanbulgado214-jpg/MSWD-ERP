import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const JEV_SELECT = {
  id: true,
  jevNumber: true,
  jevDate: true,
  sourceType: true,
  particulars: true,
  totalDebit: true,
  totalCredit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  accountingPeriod: { select: { id: true, name: true, periodNumber: true } },
  responsibilityCenter: { select: { id: true, code: true, name: true } },
  fundSource: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, username: true } },
  reviewer: { select: { id: true, username: true } },
  poster: { select: { id: true, username: true } },
  voider: { select: { id: true, username: true } },
} as const;

const JEV_DETAIL_SELECT = {
  ...JEV_SELECT,
  reviewedAt: true,
  postedAt: true,
  voidedAt: true,
  voidReason: true,
  sourceTable: true,
  sourceId: true,
  lines: {
    select: {
      id: true,
      debitAmount: true,
      creditAmount: true,
      description: true,
      chartOfAccount: { select: { id: true, accountCode: true, name: true, accountType: true } },
    },
    orderBy: [{ debitAmount: 'desc' as const }, { creditAmount: 'desc' as const }] as Prisma.JevLineOrderByWithRelationInput[],
  },
} as const;

@Injectable()
export class JevService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { status?: string; periodId?: string; search?: string },
  ) {
    return this.prisma.journalEntryVoucher.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.periodId ? { accountingPeriodId: filters.periodId } : {}),
        ...(filters?.search
          ? {
              OR: [
                { jevNumber: { contains: filters.search, mode: 'insensitive' as const } },
                { particulars: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: JEV_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findBySource(organizationId: string, sourceTable: string, sourceId: string) {
    return this.prisma.journalEntryVoucher.findMany({
      where: { organizationId, sourceTable, sourceId },
      select: {
        id: true,
        jevNumber: true,
        status: true,
        totalDebit: true,
        totalCredit: true,
        sourceType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: { id, organizationId },
      select: JEV_DETAIL_SELECT,
    });
    if (!jev) throw new NotFoundException('JEV not found.');
    return jev;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      jevDate: string;
      particulars: string;
      responsibilityCenterId?: string;
      fundSourceId?: string;
      lines: Array<{ chartOfAccountId: string; debitAmount: number; creditAmount: number; description?: string }>;
    },
  ) {
    this.validateLines(data.lines);

    const period = await this.findOpenPeriod(organizationId, new Date(data.jevDate));

    return runAudited(this.prisma, userId, async (tx) => {
      const jevNumber = await this.generateJevNumber(tx, organizationId);

      const totalDebit = data.lines.reduce((sum, l) => sum + l.debitAmount, 0);
      const totalCredit = data.lines.reduce((sum, l) => sum + l.creditAmount, 0);

      return tx.journalEntryVoucher.create({
        data: {
          organizationId,
          jevNumber,
          jevDate: new Date(data.jevDate),
          accountingPeriodId: period.id,
          sourceType: 'manual',
          particulars: data.particulars,
          ...(data.responsibilityCenterId ? { responsibilityCenterId: data.responsibilityCenterId } : {}),
          ...(data.fundSourceId ? { fundSourceId: data.fundSourceId } : {}),
          totalDebit,
          totalCredit,
          createdBy: userId,
          updatedBy: userId,
          lines: {
            create: data.lines.map((line) => ({
              chartOfAccountId: line.chartOfAccountId,
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
              ...(line.description ? { description: line.description } : {}),
            })),
          },
        },
        select: JEV_DETAIL_SELECT,
      });
    });
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      jevDate?: string;
      particulars?: string;
      responsibilityCenterId?: string;
      fundSourceId?: string;
      lines?: Array<{ chartOfAccountId: string; debitAmount: number; creditAmount: number; description?: string }>;
    },
  ) {
    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: { id, organizationId },
    });
    if (!jev) throw new NotFoundException('JEV not found.');
    if (jev.status !== 'draft') throw new BadRequestException('Only draft JEVs can be edited.');
    if (jev.version !== data.expectedVersion) {
      throw new ConflictException('JEV was modified by another user. Please refresh.');
    }

    if (data.lines) this.validateLines(data.lines);

    let periodId = jev.accountingPeriodId;
    if (data.jevDate) {
      const period = await this.findOpenPeriod(organizationId, new Date(data.jevDate));
      periodId = period.id;
    }

    return runAudited(this.prisma, userId, async (tx) => {
      if (data.lines) {
        await tx.jevLine.deleteMany({ where: { jevId: id } });
      }

      const totalDebit = data.lines
        ? data.lines.reduce((sum, l) => sum + l.debitAmount, 0)
        : undefined;
      const totalCredit = data.lines
        ? data.lines.reduce((sum, l) => sum + l.creditAmount, 0)
        : undefined;

      return tx.journalEntryVoucher.update({
        where: { id },
        data: {
          ...(data.jevDate ? { jevDate: new Date(data.jevDate), accountingPeriodId: periodId } : {}),
          ...(data.particulars ? { particulars: data.particulars } : {}),
          ...(data.responsibilityCenterId !== undefined
            ? { responsibilityCenterId: data.responsibilityCenterId || null }
            : {}),
          ...(data.fundSourceId !== undefined
            ? { fundSourceId: data.fundSourceId || null }
            : {}),
          ...(totalDebit !== undefined ? { totalDebit } : {}),
          ...(totalCredit !== undefined ? { totalCredit } : {}),
          updatedBy: userId,
          version: { increment: 1 },
          ...(data.lines
            ? {
                lines: {
                  create: data.lines.map((line) => ({
                    chartOfAccountId: line.chartOfAccountId,
                    debitAmount: line.debitAmount,
                    creditAmount: line.creditAmount,
                    ...(line.description ? { description: line.description } : {}),
                  })),
                },
              }
            : {}),
        },
        select: JEV_DETAIL_SELECT,
      });
    });
  }

  async submit(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: { id, organizationId },
    });
    if (!jev) throw new NotFoundException('JEV not found.');
    if (jev.status !== 'draft') throw new BadRequestException('Only draft JEVs can be submitted for review.');
    if (jev.version !== expectedVersion) {
      throw new ConflictException('JEV was modified. Please refresh.');
    }
    if (Number(jev.totalDebit) === 0) throw new BadRequestException('JEV has no amounts.');
    if (Number(jev.totalDebit) !== Number(jev.totalCredit)) {
      throw new BadRequestException('Debits and credits must balance before submission.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.journalEntryVoucher.update({
        where: { id },
        data: {
          status: 'for_review',
          reviewedBy: null,
          reviewedAt: null,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: JEV_DETAIL_SELECT,
      }),
    );
  }

  async post(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: { id, organizationId },
      include: { accountingPeriod: true },
    });
    if (!jev) throw new NotFoundException('JEV not found.');
    if (jev.status !== 'for_review') throw new BadRequestException('Only JEVs under review can be posted.');
    if (jev.version !== expectedVersion) {
      throw new ConflictException('JEV was modified. Please refresh.');
    }
    if (jev.accountingPeriod.status !== 'open') {
      throw new BadRequestException('Cannot post to a closed accounting period.');
    }
    if (jev.accountingPeriod.lockedAt) {
      throw new BadRequestException('Cannot post to a locked accounting period.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.journalEntryVoucher.update({
        where: { id },
        data: {
          status: 'posted',
          postedBy: userId,
          postedAt: new Date(),
          reviewedBy: userId,
          reviewedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: JEV_DETAIL_SELECT,
      }),
    );
  }

  async void(
    organizationId: string,
    id: string,
    userId: string,
    data: { expectedVersion: number; voidReason: string },
  ) {
    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: { id, organizationId },
    });
    if (!jev) throw new NotFoundException('JEV not found.');
    if (jev.status === 'voided') throw new BadRequestException('JEV is already voided.');
    if (jev.version !== data.expectedVersion) {
      throw new ConflictException('JEV was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.journalEntryVoucher.update({
        where: { id },
        data: {
          status: 'voided',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: data.voidReason,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: JEV_DETAIL_SELECT,
      }),
    );
  }

  async getOpenPeriods(organizationId: string) {
    return this.prisma.accountingPeriod.findMany({
      where: {
        fiscalYear: { organizationId },
        status: 'open',
        lockedAt: null,
      },
      select: { id: true, name: true, periodNumber: true, startDate: true, endDate: true },
      orderBy: { periodNumber: 'asc' },
    });
  }

  // ── Helpers ──

  private validateLines(
    lines: Array<{ debitAmount: number; creditAmount: number }>,
  ) {
    for (const line of lines) {
      if (line.debitAmount > 0 && line.creditAmount > 0) {
        throw new BadRequestException('A line cannot have both debit and credit amounts.');
      }
      if (line.debitAmount === 0 && line.creditAmount === 0) {
        throw new BadRequestException('Each line must have either a debit or credit amount.');
      }
    }

    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.005) {
      throw new BadRequestException(
        `Debits (${totalDebit.toFixed(2)}) and credits (${totalCredit.toFixed(2)}) must balance.`,
      );
    }
  }

  private async findOpenPeriod(organizationId: string, date: Date) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId },
        status: 'open',
        lockedAt: null,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (!period) {
      throw new BadRequestException(
        `No open accounting period found for date ${date.toISOString().slice(0, 10)}.`,
      );
    }
    return period;
  }

  private async generateJevNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = NOW()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'jev'
      RETURNING next_number
    `;

    if (seq) {
      return `JEV-${String(seq.next_number).padStart(6, '0')}`;
    }

    const [inserted] = await tx.$queryRaw<[{ next_number: bigint }]>`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'jev', 'JEV-', 1)
      RETURNING next_number
    `;
    if (!inserted) throw new Error('Failed to generate JEV number.');
    return `JEV-${String(inserted.next_number).padStart(6, '0')}`;
  }
}
