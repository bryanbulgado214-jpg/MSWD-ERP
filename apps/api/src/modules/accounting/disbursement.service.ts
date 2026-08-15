import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import type { AutoJevService } from './auto-jev.service';
import type { CreateDisbursementDto } from './dto/disbursement.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Full detail for the register row-open and the Appendix 32 printout. Procurement
// links are nullable — a non-procurement DV (travel, payroll, etc.) has none and
// carries a free-text payee instead.
const DV_DETAIL_SELECT = {
  id: true,
  dvNumber: true,
  dvDate: true,
  dvType: true,
  particulars: true,
  paymentMode: true,
  grossAmount: true,
  taxAmount: true,
  otherDeductions: true,
  netAmount: true,
  checkNumber: true,
  checkDate: true,
  bankName: true,
  accountCode: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  certifiedAt: true,
  approvedAt: true,
  releasedAt: true,
  payeeName: true,
  payeeTin: true,
  payeeAddress: true,
  ors: { select: { id: true, orsNumber: true, originalAmount: true, status: true } },
  purchaseRequest: { select: { id: true, prNumber: true, title: true, status: true } },
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      contractAmount: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  supplier: { select: { id: true, name: true, tin: true, address: true } },
  inspectionReport: { select: { id: true, reportNumber: true, overallResult: true } },
  fundSource: { select: { id: true, code: true, name: true } },
  responsibilityCenter: { select: { id: true, code: true, name: true } },
  certifier: { select: { id: true, username: true } },
  approver: { select: { id: true, username: true } },
  releaser: { select: { id: true, username: true } },
  creator: { select: { id: true, username: true } },
  updater: { select: { id: true, username: true } },
} satisfies Prisma.DisbursementVoucherSelect;

@Injectable()
export class DisbursementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  /** Register of ALL disbursement vouchers in the org (procurement + non-procurement). */
  async list(orgId: string, filters?: { status?: string; dvType?: string }) {
    const where: Prisma.DisbursementVoucherWhereInput = { organizationId: orgId };
    if (filters?.status) where.status = filters.status as never;
    if (filters?.dvType) where.dvType = filters.dvType as never;

    return this.prisma.disbursementVoucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        dvNumber: true,
        dvDate: true,
        dvType: true,
        particulars: true,
        grossAmount: true,
        netAmount: true,
        status: true,
        payeeName: true,
        supplier: { select: { name: true } },
      },
    });
  }

  async findOne(orgId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: DV_DETAIL_SELECT,
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');

    // Box B — the accounting entry (sourceType='disbursement'). A draft DV holds
    // a draft JEV until posted, so drafts are included here too.
    const journalEntry = await this.prisma.journalEntryVoucher.findFirst({
      where: {
        organizationId: orgId,
        sourceType: 'disbursement',
        sourceId: id,
        status: { in: ['posted', 'reversed', 'draft'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        jevNumber: true,
        jevDate: true,
        status: true,
        lines: {
          orderBy: { debitAmount: 'desc' },
          select: {
            debitAmount: true,
            creditAmount: true,
            description: true,
            chartOfAccount: { select: { accountCode: true, name: true } },
          },
        },
      },
    });

    return { ...dv, journalEntry };
  }

  /**
   * Create a non-procurement DV. The caller supplies only the charge/deduction
   * side of the entry (debits + any non-cash credits such as withholding tax);
   * the balancing cash credit is posted automatically to the chosen bank
   * account's Cash-in-Bank ledger account. With asDraft the DV and its entry are
   * held as drafts (no GL impact) until posted; otherwise both post immediately.
   */
  async create(orgId: string, userId: string, dto: CreateDisbursementDto) {
    // Resolve the paying bank account and its linked Cash-in-Bank ledger account.
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, organizationId: orgId },
      select: {
        id: true,
        accountName: true,
        accountNumber: true,
        chartOfAccountId: true,
        bank: { select: { name: true } },
      },
    });
    if (!bankAccount) throw new BadRequestException('Bank account not found.');
    if (!bankAccount.chartOfAccountId) {
      throw new BadRequestException(
        'The selected bank account is not linked to a Cash-in-Bank ledger account.',
      );
    }

    const totalDebit = round2(dto.lines.reduce((s, l) => s + (l.debitAmount || 0), 0));
    const totalCredit = round2(dto.lines.reduce((s, l) => s + (l.creditAmount || 0), 0));
    if (totalDebit <= 0) {
      throw new BadRequestException('The accounting entry must have at least one debit amount.');
    }
    const net = round2(totalDebit - totalCredit); // balancing cash credit
    if (net <= 0) {
      throw new BadRequestException(
        'The net amount payable (charges minus deductions) must be greater than zero.',
      );
    }

    // Validate the charge/deduction accounts belong to the org and are postable.
    const accountIds = [...new Set(dto.lines.map((l) => l.chartOfAccountId))];
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: accountIds }, organizationId: orgId, isHeader: false, isActive: true },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException(
        'One or more accounts are invalid, inactive, or a header account.',
      );
    }

    const bankDisplay = `${bankAccount.bank.name} — ${bankAccount.accountName} (${bankAccount.accountNumber})`;
    const asDraft = dto.asDraft === true;
    const dvNumber = await this.generateDvNumber(orgId);
    const now = new Date();
    const dvDate = new Date(dto.dvDate);

    // Full entry = the caller's charge/deduction lines + the auto cash credit.
    const jevLines = [
      ...dto.lines.map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        debitAmount: l.debitAmount || 0,
        creditAmount: l.creditAmount || 0,
        ...(l.description ? { description: l.description } : {}),
      })),
      {
        chartOfAccountId: bankAccount.chartOfAccountId,
        debitAmount: 0,
        creditAmount: net,
        description: `Cash disbursement — ${bankDisplay}`,
      },
    ];

    const id = await runAudited(this.prisma, userId, async (tx) => {
      const dv = await tx.disbursementVoucher.create({
        data: {
          organizationId: orgId,
          dvNumber,
          dvDate,
          dvType: dto.dvType as never,
          payeeName: dto.payeeName,
          ...(dto.payeeTin ? { payeeTin: dto.payeeTin } : {}),
          ...(dto.payeeAddress ? { payeeAddress: dto.payeeAddress } : {}),
          particulars: dto.particulars,
          paymentMode: (dto.paymentMode ?? 'check') as never,
          grossAmount: totalDebit,
          taxAmount: totalCredit,
          otherDeductions: 0,
          netAmount: net,
          bankName: bankDisplay,
          ...(dto.fundSourceId ? { fundSourceId: dto.fundSourceId } : {}),
          status: asDraft ? 'draft' : 'released',
          ...(asDraft
            ? {}
            : {
                certifiedBy: userId,
                certifiedAt: now,
                approvedBy: userId,
                approvedAt: now,
                releasedBy: userId,
                releasedAt: now,
              }),
          createdBy: userId,
          updatedBy: userId,
        },
        select: {
          id: true,
          dvNumber: true,
          dvDate: true,
          particulars: true,
          fundSourceId: true,
          responsibilityCenterId: true,
        },
      });

      const jev = await this.autoJev.postDisbursementEntry(
        tx,
        orgId,
        userId,
        dv,
        jevLines,
        asDraft ? 'draft' : 'posted',
      );
      if (!jev) {
        // Rolls back the DV — most likely no open accounting period for the date.
        throw new BadRequestException(
          'Could not record the accounting entry. Ensure an accounting period is open for the DV date.',
        );
      }

      // A check-paid DV raises a PENDING check in the register — the cashier
      // assigns the number and prints it. No check number is captured here.
      if ((dto.paymentMode ?? 'check') === 'check') {
        const check = await tx.check.create({
          data: {
            organizationId: orgId,
            disbursementVoucherId: dv.id,
            bankAccountId: dto.bankAccountId,
            checkNumber: null,
            amount: net,
            checkDate: dvDate,
            payeeName: dto.payeeName,
            status: 'pending',
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true },
        });
        await tx.checkStatusHistory.create({
          data: {
            checkId: check.id,
            toStatus: 'pending',
            changedBy: userId,
            remarks: `Pending check raised from DV ${dv.dvNumber}`,
          },
        });
      }

      return dv.id;
    });

    return this.findOne(orgId, id);
  }

  /**
   * Post a draft DV: flip its held draft JEV to posted (so it hits the GL) and
   * mark the DV released.
   */
  async postDraft(orgId: string, userId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true, version: true },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');
    if (dv.status !== 'draft') {
      throw new BadRequestException('Only draft disbursement vouchers can be posted.');
    }

    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: { organizationId: orgId, sourceType: 'disbursement', sourceId: id, status: 'draft' },
      select: { id: true, jevDate: true },
    });
    if (!jev) throw new BadRequestException('No draft accounting entry found for this voucher.');

    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId: orgId },
        status: 'open',
        lockedAt: null,
        startDate: { lte: jev.jevDate },
        endDate: { gte: jev.jevDate },
      },
      select: { id: true },
    });
    if (!period) throw new BadRequestException('No open accounting period for the DV date.');

    const now = new Date();
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.journalEntryVoucher.update({
        where: { id: jev.id },
        data: { status: 'posted', postedBy: userId, postedAt: now, updatedBy: userId },
      });
      await tx.disbursementVoucher.update({
        where: { id, version: dv.version },
        data: {
          status: 'released',
          certifiedBy: userId,
          certifiedAt: now,
          approvedBy: userId,
          approvedAt: now,
          releasedBy: userId,
          releasedAt: now,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });

    return this.findOne(orgId, id);
  }

  private async generateDvNumber(orgId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const pad = (n: number) => `DV-${year}-${String(n).padStart(4, '0')}`;

    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${orgId}::uuid
        AND document_type = 'DISBURSEMENT_VOUCHER'
      RETURNING next_number
    `);
    if (updated.length > 0) return pad(Number(updated[0]!.next_number));

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${orgId}::uuid, 'DISBURSEMENT_VOUCHER', 'DV-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate DV number.');
    return pad(Number(row.next_number));
  }
}
