import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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
  bankAccount: {
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      bank: { select: { code: true, name: true } },
    },
  },
  disbursementVoucher: { select: { id: true, dvNumber: true, status: true, dvDate: true } },
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
  pending: ['voided'],
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
          ...(data.disbursementVoucherId
            ? { disbursementVoucherId: data.disbursementVoucherId }
            : {}),
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
      include: { disbursementVoucher: { select: { dvDate: true } } },
    });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.version !== data.expectedVersion) {
      throw new ConflictException('Check was modified. Please refresh.');
    }

    // Void/spoil are destructive and go through voidCheck() (approver-only,
    // maker != checker). transition() only handles the forward lifecycle.
    if (data.toStatus === 'voided' || data.toStatus === 'spoiled') {
      throw new BadRequestException(
        'Use the void action — voiding/spoiling a check requires an approver.',
      );
    }

    const allowed = VALID_TRANSITIONS[check.status] ?? [];
    if (!allowed.includes(data.toStatus)) {
      throw new BadRequestException(`Cannot transition from ${check.status} to ${data.toStatus}.`);
    }

    const isCleared = data.toStatus === 'cleared';
    const isReleased = data.toStatus === 'released';

    if (isCleared && !data.clearedDate) {
      throw new BadRequestException('Cleared date is required.');
    }
    // A check cannot clear before the voucher it pays was even dated.
    if (isCleared && data.clearedDate && check.disbursementVoucher) {
      const dvDay = check.disbursementVoucher.dvDate.toISOString().slice(0, 10);
      if (data.clearedDate < dvDay) {
        throw new BadRequestException(`Clearing date cannot be before the DV date (${dvDay}).`);
      }
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          status: data.toStatus as any,
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

  /**
   * Cashier action: assign the physical check number to a PENDING check and mark
   * it printed. The check's DV must already be posted. Also stamps the DV so its
   * printout shows the check number.
   */
  async printCheck(
    organizationId: string,
    userId: string,
    id: string,
    data: { checkNumber: string; checkDate?: string },
  ) {
    const number = data.checkNumber?.trim();
    if (!number) throw new BadRequestException('Check number is required.');

    const check = await this.prisma.check.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        status: true,
        bankAccountId: true,
        disbursementVoucherId: true,
        disbursementVoucher: { select: { status: true } },
      },
    });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.status !== 'pending') {
      throw new BadRequestException('Only a pending check can be assigned a number and printed.');
    }
    if (check.disbursementVoucher && check.disbursementVoucher.status === 'draft') {
      throw new BadRequestException(
        'The disbursement voucher must be posted before the check can be printed.',
      );
    }

    const dup = await this.prisma.check.findFirst({
      where: {
        organizationId,
        bankAccountId: check.bankAccountId,
        checkNumber: number,
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup)
      throw new ConflictException('That check number is already used for this bank account.');

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          checkNumber: number,
          ...(data.checkDate ? { checkDate: new Date(data.checkDate) } : {}),
          status: 'printed',
          printedBy: userId,
          printedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CHECK_DETAIL_SELECT,
      });

      await tx.checkStatusHistory.create({
        data: {
          checkId: id,
          fromStatus: 'pending',
          toStatus: 'printed',
          changedBy: userId,
          remarks: `Check ${number} assigned and printed`,
        },
      });

      // Stamp the DV so its Appendix 32 printout reflects the issued check.
      if (check.disbursementVoucherId) {
        await tx.disbursementVoucher.update({
          where: { id: check.disbursementVoucherId },
          data: {
            checkNumber: number,
            ...(data.checkDate ? { checkDate: new Date(data.checkDate) } : {}),
            updatedBy: userId,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Approver-only: void or spoil a check. Enforces maker != checker — the person
   * who prepared, printed, or released the check may NOT be the one who voids it
   * (segregation of duties; the person who handled the cash can't reverse the
   * record). Gated at the controller by accounting.check.void.
   */
  async voidCheck(
    organizationId: string,
    userId: string,
    id: string,
    data: { expectedVersion: number; toStatus: 'voided' | 'spoiled'; remarks: string },
  ) {
    if (data.toStatus !== 'voided' && data.toStatus !== 'spoiled') {
      throw new BadRequestException('This action only voids or spoils a check.');
    }
    if (!data.remarks || !data.remarks.trim()) {
      throw new BadRequestException('A reason is required to void or spoil a check.');
    }

    const check = await this.prisma.check.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        status: true,
        version: true,
        createdBy: true,
        printedBy: true,
        releasedBy: true,
      },
    });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.version !== data.expectedVersion) {
      throw new ConflictException('Check was modified. Please refresh.');
    }
    if (check.status === 'voided' || check.status === 'spoiled' || check.status === 'cleared') {
      throw new BadRequestException(`A ${check.status} check cannot be voided.`);
    }

    // Maker != checker: the approver must be a different user than anyone who
    // prepared, printed, or released this check.
    const handlers = [check.createdBy, check.printedBy, check.releasedBy].filter(Boolean);
    if (handlers.includes(userId)) {
      throw new ForbiddenException(
        'Segregation of duties: the person who prepared, printed, or released a check cannot void it. A different approver must void.',
      );
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          status: data.toStatus,
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: data.remarks.trim(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CHECK_DETAIL_SELECT,
      });

      await tx.checkStatusHistory.create({
        data: {
          checkId: id,
          fromStatus: check.status,
          toStatus: data.toStatus,
          changedBy: userId,
          remarks: data.remarks.trim(),
        },
      });

      return updated;
    });
  }
}
