import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { parseAmountQuery } from './parse-amount-query';

const CHECK_SELECT = {
  id: true,
  checkNumber: true,
  checkDate: true,
  amount: true,
  payeeName: true,
  status: true,
  printedAt: true,
  releasedAt: true,
  clearedDate: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  bankAccount: {
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      // The saved check-printing layout, so the print page can overlay the
      // data at this account's calibrated positions.
      checkLayout: true,
      bank: { select: { code: true, name: true } },
    },
  },
  disbursementVoucher: {
    select: { id: true, dvNumber: true, status: true, dvDate: true, paymentMode: true },
  },
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
    filters?: { bankAccountId?: string; status?: string; search?: string; paymentMode?: string },
  ) {
    const search = filters?.search?.trim();
    let searchWhere = {};
    if (search) {
      const or: any[] = [
        { checkNumber: { contains: search, mode: 'insensitive' as const } },
        { payeeName: { contains: search, mode: 'insensitive' as const } },
      ];
      // Let users find a check by amount too (e.g. "525", "525.00", "1,234.56").
      const amount = parseAmountQuery(search);
      if (amount !== null) or.push({ amount });
      searchWhere = { OR: or };
    }
    return this.prisma.check.findMany({
      where: {
        organizationId,
        ...(filters?.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
        // Checks tab vs ADA tab: filter by the paying DV's payment mode.
        ...(filters?.paymentMode
          ? { disbursementVoucher: { is: { paymentMode: filters.paymentMode as any } } }
          : {}),
        ...searchWhere,
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

  /**
   * Report of Checks Issued (COA Appendix 35) for one month. Includes every
   * issued check (a serial number was assigned) whose Disbursement Voucher is
   * dated within the month — the month is keyed off the DV date, as required.
   */
  async getRci(
    organizationId: string,
    month: string,
    opts?: { bankAccountId?: string; fundCluster?: string },
  ) {
    const bankAccountId = opts?.bankAccountId;
    const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
    if (!m) throw new BadRequestException('Provide the month as YYYY-MM.');
    const year = Number(m[1]);
    const mon = Number(m[2]);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const endExclusive = new Date(Date.UTC(year, mon, 1));

    const checks = await this.prisma.check.findMany({
      where: {
        organizationId,
        checkNumber: { not: null },
        status: { in: ['printed', 'released', 'cleared', 'stale_dated'] },
        ...(bankAccountId ? { bankAccountId } : {}),
        disbursementVoucher: { dvDate: { gte: start, lt: endExclusive } },
      },
      orderBy: [{ checkDate: 'asc' }, { checkNumber: 'asc' }],
      select: {
        checkNumber: true,
        checkDate: true,
        amount: true,
        payeeName: true,
        disbursementVoucher: {
          select: {
            id: true,
            dvNumber: true,
            particulars: true,
            accountCode: true,
            payeeName: true,
            ors: { select: { orsNumber: true } },
            responsibilityCenter: { select: { code: true } },
            supplier: { select: { name: true } },
          },
        },
      },
    });

    // UACS object code = the primary (largest) debit account on the DV's entry.
    const dvIds = checks.map((c) => c.disbursementVoucher?.id).filter((x): x is string => !!x);
    const jevs = dvIds.length
      ? await this.prisma.journalEntryVoucher.findMany({
          where: { organizationId, sourceType: 'disbursement', sourceId: { in: dvIds } },
          select: {
            sourceId: true,
            lines: {
              orderBy: { debitAmount: 'desc' },
              select: { debitAmount: true, chartOfAccount: { select: { accountCode: true } } },
            },
          },
        })
      : [];
    const uacsByDv = new Map<string, string>();
    for (const j of jevs) {
      if (!j.sourceId) continue;
      const topDebit = j.lines.find((l) => Number(l.debitAmount) > 0);
      if (topDebit) uacsByDv.set(j.sourceId, topDebit.chartOfAccount.accountCode);
    }

    const rows = checks.map((c) => {
      const dv = c.disbursementVoucher;
      return {
        checkDate: c.checkDate,
        checkSerialNo: c.checkNumber ?? '',
        dvNumber: dv?.dvNumber ?? '',
        orsNumber: dv?.ors?.orsNumber ?? '',
        rcCode: dv?.responsibilityCenter?.code ?? '',
        payee: dv?.supplier?.name ?? dv?.payeeName ?? c.payeeName,
        uacsObjectCode: dv?.accountCode ?? (dv ? (uacsByDv.get(dv.id) ?? '') : ''),
        natureOfPayment: dv?.particulars ?? '',
        amount: Number(c.amount),
      };
    });
    const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { name: true, settings: { select: { legalName: true } } },
    });
    let bankLabel = 'All bank accounts';
    if (bankAccountId) {
      const ba = await this.prisma.bankAccount.findFirst({
        where: { id: bankAccountId, organizationId },
        select: { accountName: true, accountNumber: true, bank: { select: { name: true } } },
      });
      if (ba) bankLabel = `${ba.bank.name} — ${ba.accountName} (${ba.accountNumber})`;
    }
    const periodCovered = new Date(Date.UTC(year, mon - 1, 1)).toLocaleString('en-PH', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    return {
      periodCovered,
      entityName: org?.settings?.legalName ?? org?.name ?? '',
      fundCluster: opts?.fundCluster ?? '',
      bankLabel,
      month,
      rows,
      total,
    };
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
    data: {
      expectedVersion: number;
      toStatus: string;
      remarks?: string;
      clearedDate?: string;
      checkNumber?: string;
    },
  ) {
    const check = await this.prisma.check.findFirst({
      where: { id, organizationId },
      include: { disbursementVoucher: { select: { dvDate: true, paymentMode: true, status: true } } },
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

    const isAda = check.disbursementVoucher?.paymentMode === 'ada';
    const isCleared = data.toStatus === 'cleared';
    const isReleased = data.toStatus === 'released';
    // Clear directly (skipping print/release) from any active pre-cleared state.
    // An ADA has no print step; a check already printed OUTSIDE the system (a
    // historical entry) is just marked cleared rather than re-printed. Brand-new
    // in-system checks still follow print → release → clear via VALID_TRANSITIONS.
    const directClear =
      isCleared &&
      (check.status === 'pending' || check.status === 'assigned' || check.status === 'printed');
    const allowed = VALID_TRANSITIONS[check.status] ?? [];
    if (!directClear && !allowed.includes(data.toStatus)) {
      throw new BadRequestException(`Cannot transition from ${check.status} to ${data.toStatus}.`);
    }
    // Clearing requires the DV's accounting entry to be posted first.
    if (isCleared && check.disbursementVoucher?.status === 'draft') {
      throw new BadRequestException('Post the disbursement voucher before marking it cleared.');
    }

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

    // Optionally capture the physical check number when clearing a check printed
    // outside the system (it carried no number in AquaBooks).
    const captureNumber =
      directClear && !isAda && !check.checkNumber ? data.checkNumber?.trim() : undefined;
    if (captureNumber) {
      const clash = await this.prisma.check.findFirst({
        where: {
          organizationId,
          bankAccountId: check.bankAccountId,
          checkNumber: captureNumber,
          id: { not: id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `Check number "${captureNumber}" is already used for this bank account.`,
        );
      }
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          status: data.toStatus as any,
          ...(isReleased ? { releasedBy: userId, releasedAt: new Date() } : {}),
          ...(isCleared ? { clearedDate: new Date(data.clearedDate!) } : {}),
          ...(captureNumber ? { checkNumber: captureNumber } : {}),
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

      // Releasing OR clearing means the payment has gone out — release its DV if
      // it hasn't been already (the cashier is the releaser, not the accountant
      // who posted it — segregation of duties).
      if ((isReleased || isCleared) && check.disbursementVoucherId) {
        await tx.disbursementVoucher.updateMany({
          where: { id: check.disbursementVoucherId, status: { notIn: ['released', 'cancelled'] } },
          data: {
            status: 'released',
            releasedBy: userId,
            releasedAt: new Date(),
            updatedBy: userId,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Cashier action: correct the cleared date of an already-cleared check/ADA
   * (fixes a date entered in error). Status is unchanged; the change is logged.
   */
  async updateClearedDate(
    organizationId: string,
    id: string,
    userId: string,
    data: { expectedVersion: number; clearedDate: string },
  ) {
    const check = await this.prisma.check.findFirst({
      where: { id, organizationId },
      include: { disbursementVoucher: { select: { dvDate: true } } },
    });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.version !== data.expectedVersion) {
      throw new ConflictException('Check was modified. Please refresh.');
    }
    if (check.status !== 'cleared') {
      throw new BadRequestException('Only a cleared check or ADA can have its cleared date corrected.');
    }
    if (!data.clearedDate) throw new BadRequestException('Cleared date is required.');
    if (check.disbursementVoucher) {
      const dvDay = check.disbursementVoucher.dvDate.toISOString().slice(0, 10);
      if (data.clearedDate < dvDay) {
        throw new BadRequestException(`Clearing date cannot be before the DV date (${dvDay}).`);
      }
    }
    const prev = check.clearedDate ? check.clearedDate.toISOString().slice(0, 10) : '—';
    if (prev === data.clearedDate) return this.findOne(organizationId, id);
    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          clearedDate: new Date(data.clearedDate),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CHECK_DETAIL_SELECT,
      });
      await tx.checkStatusHistory.create({
        data: {
          checkId: id,
          fromStatus: 'cleared',
          toStatus: 'cleared',
          changedBy: userId,
          remarks: `Cleared date corrected: ${prev} → ${data.clearedDate}`,
        },
      });
      return updated;
    });
  }

  /**
   * Cashier action: reverse an erroneous clearing. A cleared check/ADA goes back
   * to "released" (issued, awaiting clearing) and its cleared date is dropped, so
   * the cashier can re-clear it with the correct date. Blocked while the check is
   * part of a bank reconciliation.
   */
  async unclearCheck(
    organizationId: string,
    id: string,
    userId: string,
    data: { expectedVersion: number },
  ) {
    const check = await this.prisma.check.findFirst({ where: { id, organizationId } });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.version !== data.expectedVersion) {
      throw new ConflictException('Check was modified. Please refresh.');
    }
    if (check.status !== 'cleared') {
      throw new BadRequestException('Only a cleared check or ADA can be un-cleared.');
    }
    const recItems = await this.prisma.bankReconciliationItem.count({ where: { checkId: id } });
    if (recItems > 0) {
      throw new BadRequestException(
        'This check appears in a bank reconciliation — remove it from the reconciliation before un-clearing.',
      );
    }
    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.check.update({
        where: { id },
        data: {
          status: 'released',
          clearedDate: null,
          // A directly-cleared check may never have had a release timestamp.
          ...(check.releasedAt ? {} : { releasedBy: userId, releasedAt: new Date() }),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CHECK_DETAIL_SELECT,
      });
      await tx.checkStatusHistory.create({
        data: {
          checkId: id,
          fromStatus: 'cleared',
          toStatus: 'released',
          changedBy: userId,
          remarks: 'Clearing reversed — check un-cleared.',
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
   * Cashier corrects a check's number (a print jam or misfeed often means the
   * physical check actually used isn't the one first assigned). Allowed while the
   * check is still in play; once it has CLEARED the bank the number is locked.
   */
  async updateCheckNumber(
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
        checkNumber: true,
        disbursementVoucherId: true,
      },
    });
    if (!check) throw new NotFoundException('Check not found.');
    if (check.status === 'cleared' || check.status === 'stale_dated') {
      throw new BadRequestException(
        'This check has cleared the bank — its number is locked and can no longer be changed.',
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
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CHECK_DETAIL_SELECT,
      });
      await tx.checkStatusHistory.create({
        data: {
          checkId: id,
          fromStatus: check.status,
          toStatus: check.status,
          changedBy: userId,
          remarks: `Check number corrected${check.checkNumber ? ` from ${check.checkNumber}` : ''} to ${number}`,
        },
      });
      // Keep the DV's stamped number in sync (its Appendix 32 printout uses it).
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
