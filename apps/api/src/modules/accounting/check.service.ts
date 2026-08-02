import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const CHECK_SELECT = {
  id: true,
  checkNumber: true,
  checkDate: true,
  amount: true,
  payeeName: true,
  status: true,
  clearedDate: true,
  voidReason: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  bankAccount: { select: { id: true, accountNumber: true, accountName: true, bank: { select: { code: true, name: true } } } },
  disbursementVoucher: { select: { id: true, dvNumber: true } },
  releaser: { select: { username: true } },
  voider: { select: { username: true } },
  creator: { select: { username: true } },
} as const;

const CHECK_DETAIL_SELECT = {
  ...CHECK_SELECT,
  releasedAt: true,
  voidedAt: true,
  statusHistory: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      changedAt: true,
      remarks: true,
      changer: { select: { username: true } },
    },
    orderBy: { changedAt: 'desc' as const },
  },
} as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  assigned: ['printed', 'released', 'spoiled', 'voided'],
  printed: ['released', 'spoiled', 'voided'],
  released: ['cleared', 'stale_dated', 'voided'],
  cleared: [],
  stale_dated: ['voided'],
  spoiled: [],
  voided: [],
};

@Injectable()
export class CheckService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { bankAccountId?: string; status?: string; search?: string },
  ) {
    return this.prisma.check.findMany({
      where: {
        organizationId,
        ...(filters?.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.search
          ? {
              OR: [
                { checkNumber: { contains: filters.search, mode: 'insensitive' as const } },
                { payeeName: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: CHECK_SELECT,
      orderBy: { checkDate: 'desc' },
      take: 200,
    });
  }

  async findOne(organizationId: string, id: string) {
    const check = await this.prisma.check.findFirst({
      where: { id, organizationId },
      select: CHECK_DETAIL_SELECT,
    });
    if (!check) throw new NotFoundException('Check not found.');
    return check;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      bankAccountId: string;
      checkNumber: string;
      amount: number;
      checkDate: string;
      payeeName: string;
      disbursementVoucherId?: string;
    },
  ) {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, organizationId, status: 'active' },
    });
    if (!bankAccount) throw new BadRequestException('Bank account not found or inactive.');

    return runAudited(this.prisma, userId, async (tx) => {
      const check = await tx.check.create({
        data: {
          organizationId,
          bankAccountId: data.bankAccountId,
          checkNumber: data.checkNumber,
          amount: data.amount,
          checkDate: new Date(data.checkDate),
          payeeName: data.payeeName,
          ...(data.disbursementVoucherId ? { disbursementVoucherId: data.disbursementVoucherId } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: CHECK_DETAIL_SELECT,
      });

      await tx.checkStatusHistory.create({
        data: {
          checkId: check.id,
          toStatus: 'assigned',
          changedBy: userId,
          remarks: 'Check assigned',
        },
      });

      return check;
    });
  }

  async transition(
    organizationId: string,
    id: string,
    userId: string,
    data: { expectedVersion: number; toStatus: string; remarks?: string; clearedDate?: string },
  ) {
    const check = await this.prisma.check.findFirst({
      where: { id, organizationId },
    });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.version !== data.expectedVersion) {
      throw new ConflictException('Check was modified. Please refresh.');
    }

    const allowed = VALID_TRANSITIONS[check.status] ?? [];
    if (!allowed.includes(data.toStatus)) {
      throw new BadRequestException(`Cannot transition from ${check.status} to ${data.toStatus}.`);
    }

    const isVoid = data.toStatus === 'voided';
    const isCleared = data.toStatus === 'cleared';
    const isReleased = data.toStatus === 'released';

    if (isVoid && !data.remarks) {
      throw new BadRequestException('Void reason is required.');
    }
    if (isCleared && !data.clearedDate) {
      throw new BadRequestException('Cleared date is required.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          status: data.toStatus as any,
          ...(isVoid ? { voidedBy: userId, voidedAt: new Date(), voidReason: data.remarks } : {}),
          ...(isReleased ? { releasedBy: userId, releasedAt: new Date() } : {}),
          ...(isCleared ? { clearedDate: new Date(data.clearedDate!) } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CHECK_DETAIL_SELECT,
      });

      await tx.checkStatusHistory.create({
        data: {
          checkId: id,
          fromStatus: check.status,
          toStatus: data.toStatus as any,
          changedBy: userId,
          ...(data.remarks ? { remarks: data.remarks } : {}),
        },
      });

      return updated;
    });
  }
}
