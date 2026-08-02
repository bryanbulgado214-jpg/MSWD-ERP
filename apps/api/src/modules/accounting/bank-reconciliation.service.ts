import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const RECON_SELECT = {
  id: true,
  reconciliationDate: true,
  bookBalance: true,
  bankBalance: true,
  adjustedBookBalance: true,
  adjustedBankBalance: true,
  difference: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  bankAccount: {
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      bank: { select: { code: true, name: true } },
    },
  },
  accountingPeriod: { select: { id: true, name: true, periodNumber: true } },
  preparer: { select: { username: true } },
  approver: { select: { username: true } },
  approvedAt: true,
} as const;

const RECON_DETAIL_SELECT = {
  ...RECON_SELECT,
  items: {
    select: {
      id: true,
      itemType: true,
      referenceNumber: true,
      referenceDate: true,
      amount: true,
      description: true,
      checkId: true,
      check: { select: { id: true, checkNumber: true, payeeName: true, status: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { bankAccountId?: string; status?: string },
  ) {
    return this.prisma.bankReconciliation.findMany({
      where: {
        organizationId,
        ...(filters?.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      select: RECON_SELECT,
      orderBy: { reconciliationDate: 'desc' },
      take: 100,
    });
  }

  async findOne(organizationId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: RECON_DETAIL_SELECT,
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    return recon;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      bankAccountId: string;
      accountingPeriodId: string;
      reconciliationDate: string;
      bookBalance: number;
      bankBalance: number;
    },
  ) {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, organizationId },
    });
    if (!bankAccount) throw new BadRequestException('Bank account not found.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.create({
        data: {
          organizationId,
          bankAccountId: data.bankAccountId,
          accountingPeriodId: data.accountingPeriodId,
          reconciliationDate: new Date(data.reconciliationDate),
          bookBalance: data.bookBalance,
          bankBalance: data.bankBalance,
          adjustedBookBalance: data.bookBalance,
          adjustedBankBalance: data.bankBalance,
          difference: data.bookBalance - data.bankBalance,
          status: 'in_progress',
          preparedBy: userId,
          createdBy: userId,
          updatedBy: userId,
        },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  async addItem(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      itemType: string;
      referenceNumber?: string;
      referenceDate: string;
      amount: number;
      description: string;
      checkId?: string;
    },
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved') throw new BadRequestException('Cannot modify an approved reconciliation.');
    if (recon.version !== data.expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.create({
        data: {
          bankReconciliationId: id,
          itemType: data.itemType as any,
          ...(data.referenceNumber ? { referenceNumber: data.referenceNumber } : {}),
          referenceDate: new Date(data.referenceDate),
          amount: data.amount,
          description: data.description,
          ...(data.checkId ? { checkId: data.checkId } : {}),
        },
      });

      const updated = await this.recalculate(tx, id, userId);
      return updated;
    });
  }

  async removeItem(
    organizationId: string,
    reconId: string,
    itemId: string,
    userId: string,
    expectedVersion: number,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id: reconId, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved') throw new BadRequestException('Cannot modify an approved reconciliation.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.delete({ where: { id: itemId } });
      return this.recalculate(tx, reconId, userId);
    });
  }

  async complete(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status !== 'in_progress') throw new BadRequestException('Only in-progress reconciliations can be completed.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.update({
        where: { id },
        data: { status: 'completed', updatedBy: userId, version: { increment: 1 } },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  async approve(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status !== 'completed') throw new BadRequestException('Only completed reconciliations can be approved.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  private async recalculate(tx: any, reconId: string, userId: string) {
    const recon = await tx.bankReconciliation.findUnique({
      where: { id: reconId },
      include: { items: true },
    });

    let bookAdjustment = 0;
    let bankAdjustment = 0;

    for (const item of recon.items) {
      const amt = Number(item.amount);
      switch (item.itemType) {
        case 'deposit_in_transit':
          bankAdjustment += amt;
          break;
        case 'outstanding_check':
          bankAdjustment -= amt;
          break;
        case 'bank_charge':
          bookAdjustment -= amt;
          break;
        case 'bank_credit':
          bookAdjustment += amt;
          break;
        case 'book_error':
          bookAdjustment += amt;
          break;
        case 'bank_error':
          bankAdjustment += amt;
          break;
      }
    }

    const adjustedBook = Number(recon.bookBalance) + bookAdjustment;
    const adjustedBank = Number(recon.bankBalance) + bankAdjustment;
    const difference = adjustedBook - adjustedBank;

    return tx.bankReconciliation.update({
      where: { id: reconId },
      data: {
        adjustedBookBalance: adjustedBook,
        adjustedBankBalance: adjustedBank,
        difference,
        updatedBy: userId,
        version: { increment: 1 },
      },
      select: RECON_DETAIL_SELECT,
    });
  }
}
