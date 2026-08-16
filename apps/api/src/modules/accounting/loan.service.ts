import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { AutoJevService } from './auto-jev.service';
import { DisbursementService } from './disbursement.service';
import { CreateLoanDto } from './dto/loan.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;
const FREQ_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function addMonths(d: Date, m: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + m);
  return x;
}

interface ScheduleLine {
  seq: number;
  dueDate: Date;
  beginningBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
}

@Injectable()
export class LoanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
    private readonly disbursements: DisbursementService,
  ) {}

  /** Compute the amortization schedule for a NEW loan from its terms. */
  private computeSchedule(dto: CreateLoanDto): ScheduleLine[] {
    const P = dto.principal;
    const n = dto.termPeriods ?? 0;
    const freq = dto.frequency ?? 'monthly';
    const months = FREQ_MONTHS[freq] ?? 1;
    const perYear = 12 / months;
    const i = (dto.annualRatePct ?? 0) / 100 / perYear;
    const method = dto.method ?? 'annuity';
    if (n < 1) throw new BadRequestException('Term (number of payments) must be at least 1.');
    const start = dto.firstPaymentDate ? new Date(dto.firstPaymentDate) : new Date();

    const fixedPayment =
      method === 'annuity' ? (i === 0 ? P / n : (P * i) / (1 - (1 + i) ** -n)) : 0;
    const fixedPrincipal = P / n;

    const lines: ScheduleLine[] = [];
    let balance = P;
    for (let k = 1; k <= n; k++) {
      const begin = round2(balance);
      const interest = round2(begin * i);
      let principal: number;
      let payment: number;
      if (method === 'annuity') {
        payment = round2(fixedPayment);
        principal = round2(payment - interest);
      } else {
        principal = round2(fixedPrincipal);
        payment = round2(principal + interest);
      }
      if (k === n) {
        principal = begin;
        payment = round2(begin + interest);
      }
      const end = round2(begin - principal);
      balance = end;
      lines.push({
        seq: k,
        dueDate: addMonths(start, months * (k - 1)),
        beginningBalance: begin,
        payment,
        interest,
        principal,
        endingBalance: end,
      });
    }
    return lines;
  }

  async create(orgId: string, userId: string, dto: CreateLoanDto) {
    // Validate the ledger accounts and paying bank belong to the org.
    const [payable, interest, bank] = await Promise.all([
      this.prisma.chartOfAccount.findFirst({
        where: { id: dto.loansPayableAccountId, organizationId: orgId, isHeader: false },
        select: { id: true },
      }),
      this.prisma.chartOfAccount.findFirst({
        where: { id: dto.interestExpenseAccountId, organizationId: orgId, isHeader: false },
        select: { id: true },
      }),
      this.prisma.bankAccount.findFirst({
        where: { id: dto.bankAccountId, organizationId: orgId },
        select: { id: true, chartOfAccountId: true },
      }),
    ]);
    if (!payable) throw new BadRequestException('Invalid Loans Payable account.');
    if (!interest) throw new BadRequestException('Invalid Interest Expense account.');
    if (!bank) throw new BadRequestException('Invalid bank account.');
    if (dto.loanType === 'new' && !bank.chartOfAccountId) {
      throw new BadRequestException(
        'The paying bank account is not linked to a Cash-in-Bank ledger account (needed to record the drawdown).',
      );
    }

    let schedule: ScheduleLine[];
    if (dto.loanType === 'existing') {
      if (!dto.schedule?.length) {
        throw new BadRequestException('Upload an amortization schedule for an existing loan.');
      }
      schedule = dto.schedule
        .map((l) => ({
          seq: l.seq,
          dueDate: new Date(l.dueDate),
          beginningBalance: round2(l.beginningBalance),
          payment: round2(l.payment),
          interest: round2(l.interest),
          principal: round2(l.principal),
          endingBalance: round2(l.endingBalance),
        }))
        .sort((a, b) => a.seq - b.seq);
    } else {
      schedule = this.computeSchedule(dto);
    }

    const loan = await runAudited(this.prisma, userId, (tx) =>
      tx.loan.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          loanType: dto.loanType,
          principal: dto.principal,
          annualRatePct: dto.annualRatePct ?? null,
          termPeriods: dto.termPeriods ?? schedule.length,
          frequency: dto.frequency ?? null,
          method: dto.method ?? null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          firstPaymentDate: dto.firstPaymentDate ? new Date(dto.firstPaymentDate) : null,
          loansPayableAccountId: dto.loansPayableAccountId,
          interestExpenseAccountId: dto.interestExpenseAccountId,
          bankAccountId: dto.bankAccountId,
          status: 'draft',
          ...(dto.remarks ? { remarks: dto.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
          amortizations: { create: schedule },
        },
        select: { id: true },
      }),
    );
    return this.get(orgId, loan.id);
  }

  async list(orgId: string) {
    const loans = await this.prisma.loan.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        loanType: true,
        principal: true,
        status: true,
        annualRatePct: true,
        termPeriods: true,
        amortizations: {
          select: { id: true, paidManual: true, disbursementVoucherId: true, endingBalance: true },
        },
      },
    });
    // Paid count folds in released DVs + manual tags.
    const dvIds = loans.flatMap((l) =>
      l.amortizations.map((a) => a.disbursementVoucherId).filter((x): x is string => !!x),
    );
    const releasedDv = await this.releasedDvSet(dvIds);
    return loans.map((l) => {
      const total = l.amortizations.length;
      const paid = l.amortizations.filter(
        (a) => a.paidManual || (a.disbursementVoucherId && releasedDv.has(a.disbursementVoucherId)),
      ).length;
      return {
        id: l.id,
        name: l.name,
        loanType: l.loanType,
        principal: Number(l.principal),
        status: l.status,
        annualRatePct: l.annualRatePct !== null ? Number(l.annualRatePct) : null,
        termPeriods: l.termPeriods,
        paid,
        total,
      };
    });
  }

  async get(orgId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, organizationId: orgId },
      include: { amortizations: { orderBy: { seq: 'asc' } } },
    });
    if (!loan) throw new NotFoundException('Loan not found.');

    const [payable, interest, bank] = await Promise.all([
      this.prisma.chartOfAccount.findUnique({
        where: { id: loan.loansPayableAccountId },
        select: { accountCode: true, name: true },
      }),
      this.prisma.chartOfAccount.findUnique({
        where: { id: loan.interestExpenseAccountId },
        select: { accountCode: true, name: true },
      }),
      this.prisma.bankAccount.findUnique({
        where: { id: loan.bankAccountId },
        select: { accountName: true, accountNumber: true, bank: { select: { name: true } } },
      }),
    ]);

    const dvIds = loan.amortizations
      .map((a) => a.disbursementVoucherId)
      .filter((x): x is string => !!x);
    const dvs = dvIds.length
      ? await this.prisma.disbursementVoucher.findMany({
          where: { id: { in: dvIds } },
          select: { id: true, dvNumber: true, status: true },
        })
      : [];
    const dvMap = new Map(dvs.map((d) => [d.id, d]));
    const released = await this.releasedDvSet(dvIds);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const amortizations = loan.amortizations.map((a) => {
      const dv = a.disbursementVoucherId ? dvMap.get(a.disbursementVoucherId) : undefined;
      let status: 'paid' | 'for_payment' | 'overdue' | 'upcoming';
      if (a.paidManual) status = 'paid';
      else if (a.disbursementVoucherId && released.has(a.disbursementVoucherId)) status = 'paid';
      else if (dv) status = 'for_payment';
      else if (new Date(a.dueDate) < today) status = 'overdue';
      else status = 'upcoming';
      return {
        id: a.id,
        seq: a.seq,
        dueDate: a.dueDate,
        beginningBalance: Number(a.beginningBalance),
        payment: Number(a.payment),
        interest: Number(a.interest),
        principal: Number(a.principal),
        endingBalance: Number(a.endingBalance),
        paidManual: a.paidManual,
        status,
        dvId: dv?.id ?? null,
        dvNumber: dv?.dvNumber ?? null,
      };
    });

    return {
      id: loan.id,
      name: loan.name,
      loanType: loan.loanType,
      principal: Number(loan.principal),
      annualRatePct: loan.annualRatePct !== null ? Number(loan.annualRatePct) : null,
      termPeriods: loan.termPeriods,
      frequency: loan.frequency,
      method: loan.method,
      startDate: loan.startDate,
      firstPaymentDate: loan.firstPaymentDate,
      status: loan.status,
      drawdownJevId: loan.drawdownJevId,
      remarks: loan.remarks,
      version: loan.version,
      accounts: {
        loansPayable: payable ? `${payable.accountCode} — ${payable.name}` : '—',
        interestExpense: interest ? `${interest.accountCode} — ${interest.name}` : '—',
        bank: bank ? `${bank.bank.name} — ${bank.accountName} (${bank.accountNumber})` : '—',
      },
      amortizations,
    };
  }

  /** Post a loan: a NEW loan books its drawdown; an EXISTING loan just goes live. */
  async post(orgId: string, userId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        name: true,
        status: true,
        loanType: true,
        principal: true,
        startDate: true,
        firstPaymentDate: true,
        loansPayableAccountId: true,
        bankAccountId: true,
      },
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    if (loan.status === 'posted') throw new BadRequestException('This loan is already posted.');

    if (loan.loanType === 'existing') {
      await this.prisma.loan.update({
        where: { id },
        data: { status: 'posted', updatedBy: userId, version: { increment: 1 } },
      });
      return this.get(orgId, id);
    }

    // New loan — record the drawdown: Dr Cash in Bank / Cr Loans Payable.
    const bank = await this.prisma.bankAccount.findUnique({
      where: { id: loan.bankAccountId },
      select: { chartOfAccountId: true },
    });
    if (!bank?.chartOfAccountId) {
      throw new BadRequestException('The paying bank account has no linked Cash-in-Bank account.');
    }
    const jevDate = loan.startDate ?? loan.firstPaymentDate ?? new Date();
    const principal = Number(loan.principal);

    await runAudited(this.prisma, userId, async (tx) => {
      const jev = await this.autoJev.createAutoJev(tx, {
        organizationId: orgId,
        userId,
        jevDate,
        sourceType: 'manual',
        sourceTable: 'loans',
        sourceId: loan.id,
        particulars: `Loan drawdown — ${loan.name}`,
        status: 'posted',
        lines: [
          {
            chartOfAccountId: bank.chartOfAccountId!,
            debitAmount: principal,
            creditAmount: 0,
            description: `Loan proceeds — ${loan.name}`,
          },
          {
            chartOfAccountId: loan.loansPayableAccountId,
            debitAmount: 0,
            creditAmount: principal,
            description: `Loans Payable — ${loan.name}`,
          },
        ],
      });
      if (!jev) {
        throw new BadRequestException(
          'Could not post the drawdown — ensure an accounting period is open for the loan start date.',
        );
      }
      await tx.loan.update({
        where: { id },
        data: {
          status: 'posted',
          drawdownJevId: jev.id,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });
    return this.get(orgId, id);
  }

  /** Create a Disbursement Voucher that pays one amortization line. */
  async createDvForLine(
    orgId: string,
    userId: string,
    loanId: string,
    amortizationId: string,
    dvDate?: string,
  ) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, organizationId: orgId },
      select: {
        id: true,
        name: true,
        status: true,
        bankAccountId: true,
        loansPayableAccountId: true,
        interestExpenseAccountId: true,
        termPeriods: true,
      },
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    if (loan.status !== 'posted') {
      throw new BadRequestException('Post the loan before creating disbursement vouchers for it.');
    }
    const line = await this.prisma.loanAmortization.findFirst({
      where: { id: amortizationId, loanId },
    });
    if (!line) throw new NotFoundException('Amortization line not found.');
    if (line.paidManual) throw new BadRequestException('This line is already marked paid.');
    if (line.disbursementVoucherId) {
      const existing = await this.prisma.disbursementVoucher.findUnique({
        where: { id: line.disbursementVoucherId },
        select: { id: true },
      });
      if (existing) throw new BadRequestException('This line already has a disbursement voucher.');
    }

    const principal = Number(line.principal);
    const interest = Number(line.interest);
    const lines = [
      {
        chartOfAccountId: loan.loansPayableAccountId,
        debitAmount: principal,
        creditAmount: 0,
        description: `Loan principal — ${loan.name}`,
      },
      ...(interest > 0
        ? [
            {
              chartOfAccountId: loan.interestExpenseAccountId,
              debitAmount: interest,
              creditAmount: 0,
              description: `Loan interest — ${loan.name}`,
            },
          ]
        : []),
    ];

    const dv = await this.disbursements.create(orgId, userId, {
      dvType: 'other',
      dvDate: dvDate ?? new Date(line.dueDate).toISOString().slice(0, 10),
      payeeName: loan.name,
      particulars: `Loan amortization ${line.seq}/${loan.termPeriods ?? '?'} — ${loan.name} (due ${new Date(line.dueDate).toLocaleDateString('en-PH')})`,
      paymentMode: 'check',
      bankAccountId: loan.bankAccountId,
      lines,
    });

    await this.prisma.loanAmortization.update({
      where: { id: amortizationId },
      data: { disbursementVoucherId: dv.id },
    });
    return this.get(orgId, loanId);
  }

  /** Manually tag (or untag) an amortization line as paid — for historical lines. */
  async markPaid(
    orgId: string,
    userId: string,
    loanId: string,
    amortizationId: string,
    paid: boolean,
  ) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, organizationId: orgId },
      select: { id: true },
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    const line = await this.prisma.loanAmortization.findFirst({
      where: { id: amortizationId, loanId },
      select: { id: true },
    });
    if (!line) throw new NotFoundException('Amortization line not found.');
    await this.prisma.loanAmortization.update({
      where: { id: amortizationId },
      data: {
        paidManual: paid,
        paidManualAt: paid ? new Date() : null,
        paidManualBy: paid ? userId : null,
      },
    });
    return this.get(orgId, loanId);
  }

  async remove(orgId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!loan) throw new NotFoundException('Loan not found.');
    if (loan.status === 'posted') {
      throw new BadRequestException('A posted loan cannot be deleted. Reverse its entries first.');
    }
    await this.prisma.loan.delete({ where: { id } });
    return { deleted: true };
  }

  /** DV ids whose latest check has been released (or cleared) by the cashier. */
  private async releasedDvSet(dvIds: string[]): Promise<Set<string>> {
    if (!dvIds.length) return new Set();
    const checks = await this.prisma.check.findMany({
      where: { disbursementVoucherId: { in: dvIds } },
      orderBy: { createdAt: 'desc' },
      select: { disbursementVoucherId: true, status: true },
    });
    const latest = new Map<string, string>();
    for (const c of checks) {
      if (c.disbursementVoucherId && !latest.has(c.disbursementVoucherId)) {
        latest.set(c.disbursementVoucherId, c.status);
      }
    }
    const set = new Set<string>();
    for (const [dvId, status] of latest) {
      if (status === 'released' || status === 'cleared') set.add(dvId);
    }
    return set;
  }
}
