import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { getGrantedPermissionCodes } from '../../common/guards/get-granted-permission-codes';
import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';
import { NotificationService } from '../notification/notification.service';

import { AutoJevService } from './auto-jev.service';
import { dateRangeFilter } from './date-range-filter';
import { CreateDisbursementDto } from './dto/disbursement.dto';

const pesoText = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Supporting documents attached to a DV live on disk under the API working dir;
// the Attachment row keeps the relative path. (uploads/ is gitignored.)
const DV_UPLOAD_SUBDIR = path.join('uploads', 'disbursements');
const DV_ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];

// Withholding payables the WHT assistant credits — used to split a DV's entry
// into the creditable EWT and the government business-tax withholding for the
// BIR Form 2307. ATCs are best-effort prefills (the certificate is editable).
const EWT_ACCOUNT_CODE = '2-02-01-010-02'; // Due to BIR - Expanded Withholding Tax
const GMP_VAT_ACCOUNT_CODE = '2-02-01-010-04'; // Due to BIR - Withholding VAT on GMP (5%)
const GMP_PCT_ACCOUNT_CODE = '2-02-01-010-03'; // Due to BIR - Withholding Percentage Tax on GMP (3%)
const EWT_KINDS: Array<{ rate: number; nature: string; atc: string }> = [
  { rate: 0.01, nature: 'Purchase of goods', atc: 'WC640' },
  { rate: 0.02, nature: 'Purchase of services', atc: 'WC157' },
  { rate: 0.05, nature: 'Rentals', atc: 'WC100' },
  { rate: 0.1, nature: 'Professional / Talent fees', atc: 'WC010' },
];

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
    private readonly notifications: NotificationService,
  ) {}

  /** Edit a DV's document number directly — accountant, no approval, any status.
   *  Keeps the DV's own GL entry (which carries the DV number) aligned. */
  async updateNumber(organizationId: string, actorId: string, id: string, dvNumber: string) {
    const number = dvNumber?.trim();
    if (!number) throw new BadRequestException('DV number is required.');
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');
    const taken = await this.prisma.disbursementVoucher.findFirst({
      where: { organizationId, dvNumber: number, id: { not: id } },
      select: { id: true },
    });
    if (taken) throw new ConflictException(`DV number "${number}" is already in use.`);
    return runAudited(this.prisma, actorId, async (tx) => {
      const updated = await tx.disbursementVoucher.update({
        where: { id },
        data: { dvNumber: number, updatedBy: actorId },
        select: { id: true, dvNumber: true },
      });
      // The DV's GL entry carries the DV number — keep it aligned.
      await tx.journalEntryVoucher.updateMany({
        where: { organizationId, sourceTable: 'disbursement_vouchers', sourceId: id },
        data: { jevNumber: number, updatedBy: actorId },
      });
      return updated;
    });
  }

  /** Register of ALL disbursement vouchers in the org (procurement + non-procurement). */
  async list(
    orgId: string,
    filters?: {
      status?: string;
      dvType?: string;
      withholding?: boolean;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const where: Prisma.DisbursementVoucherWhereInput = { organizationId: orgId };
    if (filters?.status) where.status = filters.status as never;
    if (filters?.dvType) where.dvType = filters.dvType as never;
    // BIR Form 2307 register: only DVs that withheld a tax.
    if (filters?.withholding) where.taxAmount = { gt: 0 };
    const dvDate = dateRangeFilter(filters?.dateFrom, filters?.dateTo);
    if (dvDate) where.dvDate = dvDate;

    const dvs = await this.prisma.disbursementVoucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        dvNumber: true,
        dvDate: true,
        dvType: true,
        particulars: true,
        paymentMode: true,
        grossAmount: true,
        taxAmount: true,
        netAmount: true,
        status: true,
        certifiedAt: true,
        approvedAt: true,
        releasedAt: true,
        payeeName: true,
        supplier: { select: { name: true } },
        // The most recently issued check. Its lifecycle
        // (pending → printed → released → cleared) is the payment status the
        // cashier works through; surfacing it here lets the accountant's DV
        // register show the same state, instead of freezing at "released".
        checks: {
          select: {
            status: true,
            printedAt: true,
            releasedAt: true,
            clearedDate: true,
            voidedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return dvs.map(({ checks, certifiedAt, approvedAt, releasedAt, ...dv }) => {
      const c = checks[0];
      // The timestamp of the action that put the CHECK in its current state.
      const checkStatusDate =
        c?.status === 'cleared'
          ? c.clearedDate
          : c?.status === 'released'
            ? c.releasedAt
            : c?.status === 'printed'
              ? c.printedAt
              : c?.status === 'voided' || c?.status === 'spoiled'
                ? c.voidedAt
                : null;
      // With no check, fall back to the DV's own status timestamp so every
      // voucher shows a date under its status (kept consistent across the list).
      const dvStatusDate =
        dv.status === 'released'
          ? releasedAt
          : dv.status === 'approved'
            ? approvedAt
            : dv.status === 'certified'
              ? certifiedAt
              : null;
      return {
        ...dv,
        checkStatus: c?.status ?? null,
        checkStatusDate: (c ? checkStatusDate : dvStatusDate) ?? null,
      };
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
            chartOfAccountId: true,
            debitAmount: true,
            creditAmount: true,
            description: true,
            chartOfAccount: { select: { accountCode: true, name: true } },
          },
        },
      },
    });

    // The paying bank account lives on the raised check, not the DV row —
    // surfaced so the edit form can prefill the bank dropdown.
    const check = await this.prisma.check.findFirst({
      where: { disbursementVoucherId: id },
      orderBy: { createdAt: 'desc' },
      select: { bankAccountId: true, status: true },
    });

    // Fallback when there is no check (e.g. an ADA payment or older entry): the
    // bank is whichever Cash-in-Bank account the entry's cash-disbursement line
    // credits, so the edit form still prefills the original bank account.
    let bankAccountId = check?.bankAccountId ?? null;
    if (!bankAccountId && journalEntry) {
      const CASH_RE = /cash in bank|modified disbursement|cash[- ]*mds|\bmds\b/i;
      const cashLine = journalEntry.lines.find(
        (l) =>
          Number(l.creditAmount) > 0 &&
          ((l.description ?? '').startsWith('Cash disbursement —') ||
            CASH_RE.test(l.chartOfAccount?.name ?? '')),
      );
      if (cashLine) {
        const ba = await this.prisma.bankAccount.findFirst({
          where: { organizationId: orgId, chartOfAccountId: cashLine.chartOfAccountId },
          select: { id: true },
        });
        bankAccountId = ba?.id ?? null;
      }
    }

    return {
      ...dv,
      journalEntry,
      bankAccountId,
      checkStatus: check?.status ?? null,
    };
  }

  /**
   * Assemble the data for BIR Form 2307 (Certificate of Creditable Tax Withheld
   * at Source) from a disbursement voucher. The payee is the DV payee, the payor
   * (withholding agent) is the district itself; the income payment is the gross
   * charge and the tax withheld is the sum of the non-cash credit lines. The
   * withholding-account lines are returned so the certificate can list each one.
   * All figures are prefills — the certificate's fields are editable in the UI.
   */
  async getBir2307(orgId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: {
        dvNumber: true,
        dvDate: true,
        particulars: true,
        grossAmount: true,
        taxAmount: true,
        netAmount: true,
        payeeName: true,
        payeeTin: true,
        payeeAddress: true,
        supplier: { select: { name: true, tin: true, address: true } },
        organization: {
          select: {
            name: true,
            settings: {
              select: {
                legalName: true,
                address: true,
                tin: true,
                zipCode: true,
                birRepName: true,
                birRepDesignation: true,
                birRepTin: true,
              },
            },
          },
        },
      },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');

    const jev = await this.prisma.journalEntryVoucher.findFirst({
      where: {
        organizationId: orgId,
        sourceType: 'disbursement',
        sourceId: id,
        status: { in: ['posted', 'reversed', 'draft'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        jevNumber: true,
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
    const lines = jev?.lines ?? [];

    // Income-payment (base) lines = the debit charges; withholding lines = the
    // non-cash credits (everything but the auto "Cash disbursement —" credit).
    const incomeLines = lines
      .filter((l) => Number(l.debitAmount) > 0)
      .map((l) => ({
        accountCode: l.chartOfAccount.accountCode,
        accountName: l.chartOfAccount.name,
        description: l.description ?? '',
        amount: Number(l.debitAmount),
      }));
    // Withholding lines = the credit lines that are NOT the cash disbursement.
    // The cash side always credits a Cash-in-Bank account, so exclude any credit
    // to a "Cash …" account (robust across accounting and procurement DVs).
    const withholdingLines = lines
      .filter((l) => Number(l.creditAmount) > 0 && !/cash/i.test(l.chartOfAccount.name))
      .map((l) => ({
        accountCode: l.chartOfAccount.accountCode,
        accountName: l.chartOfAccount.name,
        description: l.description ?? '',
        amount: Number(l.creditAmount),
      }));

    // Structured withholding breakdown for the certificate's two sections. When
    // the entry was built by the withholding-tax assistant it credits the known
    // BIR payables — Expanded Withholding Tax (…-02), GMP VAT (…-04) or GMP
    // percentage tax (…-03) — so the creditable EWT and the business-tax
    // withholding can be split out, each certified on its own income-payment
    // base (net of VAT for a VAT-registered payee), rather than lumping the
    // gross-up amount into a single EWT line.
    const creditOf = (code: string) => {
      const l = lines.find(
        (x) => x.chartOfAccount.accountCode === code && Number(x.creditAmount) > 0,
      );
      return l ? round2(Number(l.creditAmount)) : null;
    };
    const totalDebit = round2(
      lines.filter((l) => Number(l.debitAmount) > 0).reduce((s, l) => s + Number(l.debitAmount), 0),
    );
    const ewtAmount = creditOf(EWT_ACCOUNT_CODE);
    const gvatAmount = creditOf(GMP_VAT_ACCOUNT_CODE);
    const pctAmount = creditOf(GMP_PCT_ACCOUNT_CODE);

    let withholding: {
      taxBase: number;
      vatRegistered: boolean;
      ewt: { rate: number; amount: number; nature: string; atc: string };
      businessTax: { type: 'vat' | 'percentage'; rate: number; amount: number; atc: string } | null;
    } | null = null;
    if (ewtAmount !== null) {
      const vatRegistered = gvatAmount !== null;
      const taxBase = round2(vatRegistered ? totalDebit / 1.12 : totalDebit);
      const rawRate = taxBase > 0 ? ewtAmount / taxBase : 0;
      const match = EWT_KINDS.reduce((best, k) =>
        Math.abs(k.rate - rawRate) < Math.abs(best.rate - rawRate) ? k : best,
      );
      withholding = {
        taxBase,
        vatRegistered,
        ewt: { rate: match.rate, amount: ewtAmount, nature: match.nature, atc: match.atc },
        businessTax:
          gvatAmount !== null
            ? { type: 'vat', rate: 0.05, amount: gvatAmount, atc: 'WV012' }
            : pctAmount !== null
              ? { type: 'percentage', rate: 0.03, amount: pctAmount, atc: 'WB080' }
              : null,
      };
    }

    const settings = dv.organization.settings;
    return {
      dvNumber: dv.dvNumber,
      dvDate: dv.dvDate,
      particulars: dv.particulars,
      incomePayment: Number(dv.grossAmount),
      taxWithheld: Number(dv.taxAmount),
      net: Number(dv.netAmount),
      jevNumber: jev?.jevNumber ?? null,
      payee: {
        name: dv.supplier?.name ?? dv.payeeName ?? '',
        tin: dv.supplier?.tin ?? dv.payeeTin ?? '',
        address: dv.supplier?.address ?? dv.payeeAddress ?? '',
      },
      payor: {
        name: settings?.legalName ?? dv.organization.name,
        tin: settings?.tin ?? '',
        address: settings?.address ?? '',
        zip: settings?.zipCode ?? '',
      },
      // The district's authorized representative who signs the certificate
      // (printed over the Payor signature line), from the District Profile.
      payorRep: {
        name: settings?.birRepName ?? '',
        designation: settings?.birRepDesignation ?? '',
        tin: settings?.birRepTin ?? '',
      },
      incomeLines,
      withholdingLines,
      withholding,
    };
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

    // Paying a supplier's invoice: the debit must settle that invoice's Accounts
    // Payable, and the amount applied cannot exceed the outstanding balance. The
    // amount applied to the payable is the total debit (Dr Accounts Payable).
    if (dto.supplierInvoiceId) {
      const invoice = await this.prisma.supplierInvoice.findFirst({
        where: { id: dto.supplierInvoiceId, organizationId: orgId },
        select: {
          id: true,
          netAmount: true,
          amountPaid: true,
          apAccountId: true,
          invoiceNumber: true,
          dueSchedule: true,
        },
      });
      if (!invoice) throw new BadRequestException('The supplier invoice being paid was not found.');
      const apId = invoice.apAccountId;
      const debitsNotToAp = dto.lines.some(
        (l) => (l.debitAmount || 0) > 0 && l.chartOfAccountId !== apId,
      );
      if (!apId || debitsNotToAp) {
        throw new BadRequestException(
          'A payment for a supplier invoice must debit that invoice’s Accounts Payable account. ' +
            'In the Withholding Tax Assistant, set the account charged to Accounts Payable.',
        );
      }
      const balance = round2(Number(invoice.netAmount) - Number(invoice.amountPaid));
      if (totalDebit > balance + 0.01) {
        throw new BadRequestException(
          `The payment (${pesoText(totalDebit)}) exceeds invoice ${invoice.invoiceNumber}'s ` +
            `outstanding balance (${pesoText(balance)}).`,
        );
      }
      if (dto.supplierInvoiceInstallment != null) {
        const schedule = Array.isArray(invoice.dueSchedule)
          ? (invoice.dueSchedule as unknown[])
          : [];
        if (
          dto.supplierInvoiceInstallment < 1 ||
          dto.supplierInvoiceInstallment > schedule.length
        ) {
          throw new BadRequestException(
            'The selected installment is not on this invoice’s payment schedule.',
          );
        }
      }
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
    // dv.bank_name is VarChar(100); store a compact label (bank + account number)
    // and cap it so a long account name never overflows the column.
    const dvBankName = `${bankAccount.bank.name} — ${bankAccount.accountNumber}`.slice(0, 100);
    const asDraft = dto.asDraft === true;
    // A check-paid DV is released by the CASHIER after they print and release the
    // check — so posting it only takes it to "approved" with a pending check.
    // Non-check disbursements (ADA/others) have no check to print, so they release
    // on post.
    const mode = dto.paymentMode ?? 'check';
    const isCheckPayment = mode === 'check';
    const isAda = mode === 'ada';
    // Non-check disbursements (ADA / others) have no check to print, so posting
    // them releases the DV straight away (there is no cashier print step).
    const autoRelease = !asDraft && !isCheckPayment;

    // Posting straight to the GL requires the Post permission. Data-entry staff
    // can only save a draft; the accountant reviews and posts it.
    if (!asDraft) {
      const granted = await getGrantedPermissionCodes(this.prisma, userId);
      if (!granted.has('accounting.dv.post')) {
        throw new ForbiddenException(
          'You can save this as a draft, but posting a disbursement voucher needs the ' +
            '“Post Disbursement Vouchers” permission. Save it as a draft — the accountant will review and post it.',
        );
      }
    }

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: orgId },
      select: { manualDocumentNumbering: true },
    });
    const manualNumbering = settings?.manualDocumentNumbering ?? false;
    const manualNumber = dto.dvNumber?.trim();
    if (manualNumbering && !manualNumber) {
      throw new BadRequestException('Enter the DV number (manual numbering is turned on).');
    }
    if (manualNumber) {
      const clash = await this.prisma.disbursementVoucher.findFirst({
        where: { organizationId: orgId, dvNumber: manualNumber },
        select: { id: true },
      });
      if (clash) throw new ConflictException(`DV number "${manualNumber}" is already used.`);
    }
    const dvNumber = manualNumber ?? (await this.generateDvNumber(orgId));
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
          bankName: dvBankName,
          ...(dto.supplierInvoiceId ? { supplierInvoiceId: dto.supplierInvoiceId } : {}),
          ...(dto.supplierInvoiceInstallment != null
            ? { supplierInvoiceInstallment: dto.supplierInvoiceInstallment }
            : {}),
          ...(dto.fundSourceId ? { fundSourceId: dto.fundSourceId } : {}),
          // A check-paid DV posts to "approved" and waits for the cashier to
          // print + release the check. A non-check DV (ADA / others) has no
          // check to print, so posting it releases it immediately.
          status: asDraft ? 'draft' : autoRelease ? 'released' : 'approved',
          ...(asDraft
            ? {}
            : {
                certifiedBy: userId,
                certifiedAt: now,
                approvedBy: userId,
                approvedAt: now,
                ...(autoRelease ? { releasedBy: userId, releasedAt: now } : {}),
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
      if (isCheckPayment) {
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
      } else if (isAda) {
        // ADA has no printed check. Raise a debit record so the cashier can mark
        // it CLEARED once it reflects in the bank passbook, and so it flows into
        // bank reconciliation like a check. It is 'released' as soon as the DV is
        // posted (nothing to print); a draft's record waits at 'pending' until
        // the DV is posted.
        const adaStatus = asDraft ? 'pending' : 'released';
        const ada = await tx.check.create({
          data: {
            organizationId: orgId,
            disbursementVoucherId: dv.id,
            bankAccountId: dto.bankAccountId,
            checkNumber: null,
            amount: net,
            checkDate: dvDate,
            payeeName: dto.payeeName,
            status: adaStatus as never,
            ...(asDraft ? {} : { releasedBy: userId, releasedAt: now }),
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true },
        });
        await tx.checkStatusHistory.create({
          data: {
            checkId: ada.id,
            toStatus: adaStatus as never,
            changedBy: userId,
            remarks: asDraft
              ? `ADA debit queued from draft DV ${dv.dvNumber}`
              : `ADA debit released on posting DV ${dv.dvNumber}`,
          },
        });
      }

      if (dto.supplierInvoiceId) {
        await this.recomputeInvoicePaid(tx, dto.supplierInvoiceId);
      }

      return dv.id;
    });

    // A draft awaits the accountant — let whoever can post it know.
    if (asDraft) {
      await this.notifications.notifyUsersWithPermission(
        orgId,
        'accounting.dv.post',
        {
          title: `DV ${dvNumber} is pending review`,
          body: `${dto.payeeName} — ${pesoText(net)}`,
          linkUrl: `/accounting/disbursements/${id}`,
          relatedTable: 'disbursement_vouchers',
          relatedId: id,
        },
        userId,
      );
    }

    return this.findOne(orgId, id);
  }

  /**
   * Edit a disbursement voucher: re-validate the resubmitted form and rebuild its
   * accounting entry. A draft rebuilds its held draft JEV + pending check. A
   * posted/released DV re-posts its JEV (an accountant step — needs dv.post).
   *
   * Once its check has CLEARED the bank the payment is settled, so the fields the
   * check embodies — payee, bank account and amount — are locked; the DV date,
   * number, particulars and the accounting classification can still be corrected.
   * The cleared check itself is never touched. For a not-yet-cleared check, the
   * check is left alone unless payee/bank/amount changed, in which case a fresh
   * pending check is raised so the cashier reprints.
   */
  async update(orgId: string, userId: string, id: string, dto: CreateDisbursementDto) {
    const existing = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        status: true,
        dvNumber: true,
        payeeName: true,
        netAmount: true,
        supplierInvoiceId: true,
        checks: { select: { id: true, status: true, bankAccountId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Disbursement voucher not found.');
    if (existing.status === 'cancelled') {
      throw new BadRequestException('A cancelled disbursement voucher cannot be edited.');
    }
    const isDraft = existing.status === 'draft';
    const clearedCheck = existing.checks.find((c) => c.status === 'cleared');
    // Editing a posted voucher re-posts its GL entry — the accountant's call.
    if (!isDraft) {
      const granted = await getGrantedPermissionCodes(this.prisma, userId);
      if (!granted.has('accounting.dv.post')) {
        throw new ForbiddenException(
          'Editing a posted disbursement voucher needs the “Post Disbursement Vouchers” permission.',
        );
      }
    }

    // Same validation + entry-building as create().
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
    const net = round2(totalDebit - totalCredit);
    if (net <= 0) {
      throw new BadRequestException(
        'The net amount payable (charges minus deductions) must be greater than zero.',
      );
    }

    // Did any field the check embodies change (payee, bank account, amount)?
    const anyCheck = existing.checks[0];
    const checkFieldsChanged =
      dto.payeeName.trim() !== (existing.payeeName ?? '') ||
      net !== round2(Number(existing.netAmount)) ||
      (anyCheck ? dto.bankAccountId !== anyCheck.bankAccountId : false);
    // A cleared check is a settled payment — those fields are locked.
    if (clearedCheck && checkFieldsChanged) {
      const changed: string[] = [];
      if (dto.payeeName.trim() !== (existing.payeeName ?? '')) changed.push('payee');
      if (dto.bankAccountId !== clearedCheck.bankAccountId) changed.push('bank account');
      if (net !== round2(Number(existing.netAmount))) changed.push('amount');
      throw new BadRequestException(
        `The ${changed.join(', ')} cannot be changed — the check for ${existing.dvNumber} has already cleared the bank. ` +
          'You can still edit the DV date, number, particulars and the accounting entry.',
      );
    }

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
    // dv.bank_name is VarChar(100) — compact + capped so it never overflows.
    const dvBankName = `${bankAccount.bank.name} — ${bankAccount.accountNumber}`.slice(0, 100);
    const dvDate = new Date(dto.dvDate);
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

    // The DV number can be edited here too (no separate step). Keep it unique.
    const newDvNumber = dto.dvNumber?.trim() || existing.dvNumber;
    if (newDvNumber !== existing.dvNumber) {
      const taken = await this.prisma.disbursementVoucher.findFirst({
        where: { organizationId: orgId, dvNumber: newDvNumber, id: { not: id } },
        select: { id: true },
      });
      if (taken) throw new ConflictException(`DV number "${newDvNumber}" is already in use.`);
    }

    // Draft edits always rebuild the pending check; a posted edit only re-raises
    // it when the payee/bank/amount changed (a cleared check is never touched).
    const reissueCheck = isDraft || (!clearedCheck && checkFieldsChanged);
    const jevStatus = isDraft ? 'draft' : 'posted';
    await runAudited(this.prisma, userId, async (tx) => {
      // Replace the accounting entry (draft or posted; jev_lines cascade).
      await tx.journalEntryVoucher.deleteMany({
        where: { organizationId: orgId, sourceType: 'disbursement', sourceId: id },
      });
      if (reissueCheck && existing.checks.length) {
        const ids = existing.checks.map((c) => c.id);
        await tx.bankReconciliationItem.deleteMany({ where: { checkId: { in: ids } } });
        await tx.checkStatusHistory.deleteMany({ where: { checkId: { in: ids } } });
        await tx.check.deleteMany({ where: { id: { in: ids } } });
      }

      const dv = await tx.disbursementVoucher.update({
        where: { id },
        data: {
          dvNumber: newDvNumber,
          dvDate,
          dvType: dto.dvType as never,
          payeeName: dto.payeeName,
          payeeTin: dto.payeeTin ?? null,
          payeeAddress: dto.payeeAddress ?? null,
          particulars: dto.particulars,
          paymentMode: (dto.paymentMode ?? 'check') as never,
          grossAmount: totalDebit,
          taxAmount: totalCredit,
          otherDeductions: 0,
          netAmount: net,
          bankName: dvBankName,
          fundSourceId: dto.fundSourceId ?? null,
          // Re-raising the check on a posted DV sends it back to awaiting release.
          ...(reissueCheck && !isDraft ? { status: 'approved' as never } : {}),
          updatedBy: userId,
          version: { increment: 1 },
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
        jevStatus,
      );
      if (!jev) {
        throw new BadRequestException(
          'Could not record the accounting entry. Ensure an accounting period is open for the DV date.',
        );
      }

      if (reissueCheck && (dto.paymentMode ?? 'check') === 'check') {
        const check = await tx.check.create({
          data: {
            organizationId: orgId,
            disbursementVoucherId: id,
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
            remarks: `Pending check re-raised from edited DV ${dv.dvNumber}`,
          },
        });
      }

      // A payment's amount may have changed — re-settle the invoice's balance.
      if (existing.supplierInvoiceId) {
        await this.recomputeInvoicePaid(tx, existing.supplierInvoiceId);
      }
    });

    return this.findOne(orgId, id);
  }

  /**
   * Delete a disbursement voucher and everything it holds — its accounting entry
   * (draft or posted JEV, lines cascade) and its check(s) (+ history, bank-rec
   * items). A draft is deletable by its preparer; a posted/printed DV can be
   * deleted by the accountant (dv.post) as long as its check has NOT cleared the
   * bank. A cleared check is a settled payment — reverse it instead of deleting.
   */
  /**
   * Recompute a supplier invoice's settled amount and status from its payment
   * DVs. Only posted, non-cancelled payments settle the payable (a draft DV
   * hasn't hit the ledger). The amount applied is each payment's total debit to
   * Accounts Payable, carried on the DV as its gross amount.
   */
  private async recomputeInvoicePaid(tx: Prisma.TransactionClient, invoiceId: string) {
    const invoice = await tx.supplierInvoice.findUnique({
      where: { id: invoiceId },
      select: { netAmount: true },
    });
    if (!invoice) return;
    const agg = await tx.disbursementVoucher.aggregate({
      where: { supplierInvoiceId: invoiceId, status: { notIn: ['draft', 'cancelled'] } },
      _sum: { grossAmount: true },
    });
    const paid = round2(Number(agg._sum.grossAmount ?? 0));
    const net = Number(invoice.netAmount);
    const status = paid >= net - 0.01 ? 'paid' : paid > 0.01 ? 'partially_paid' : 'unpaid';
    await tx.supplierInvoice.update({
      where: { id: invoiceId },
      data: { amountPaid: paid, status },
    });
  }

  async remove(orgId: string, userId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        status: true,
        dvNumber: true,
        supplierInvoiceId: true,
        checks: { select: { id: true, status: true } },
      },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');

    // Deleting a posted/printed DV reverses its GL entry and voids the check —
    // the accountant's call, not data-entry's.
    if (dv.status !== 'draft') {
      const granted = await getGrantedPermissionCodes(this.prisma, userId);
      if (!granted.has('accounting.dv.post')) {
        throw new ForbiddenException(
          'Deleting a posted disbursement voucher needs the “Post Disbursement Vouchers” permission.',
        );
      }
    }
    // A check that has cleared the bank is a settled payment — it must be
    // reversed, never silently deleted.
    if (dv.checks.some((c) => c.status === 'cleared')) {
      throw new BadRequestException(
        `${dv.dvNumber} cannot be deleted — its check has already cleared the bank. Reverse the entry instead.`,
      );
    }

    const checkIds = dv.checks.map((c) => c.id);
    await runAudited(this.prisma, userId, async (tx) => {
      if (checkIds.length) {
        await tx.bankReconciliationItem.deleteMany({ where: { checkId: { in: checkIds } } });
        await tx.checkStatusHistory.deleteMany({ where: { checkId: { in: checkIds } } });
        await tx.check.deleteMany({ where: { id: { in: checkIds } } });
      }
      // The DV's accounting entry — draft or posted; jev_lines cascade.
      await tx.journalEntryVoucher.deleteMany({
        where: { organizationId: orgId, sourceType: 'disbursement', sourceId: id },
      });
      // The DV itself — dv_deductions cascade.
      await tx.disbursementVoucher.delete({ where: { id } });
      // If it paid a supplier invoice, re-settle that invoice's balance/status.
      if (dv.supplierInvoiceId) {
        await this.recomputeInvoicePaid(tx, dv.supplierInvoiceId);
      }
    });
    return { deleted: true };
  }

  /**
   * Post a draft DV: flip its held draft JEV to posted (so it hits the GL) and
   * mark the DV released.
   */
  async postDraft(orgId: string, userId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true, version: true, paymentMode: true, supplierInvoiceId: true },
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

    // A check-paid DV posts to "approved" and is released when the cashier
    // releases the printed check. A non-check DV (ADA / others) has no check to
    // print, so posting it releases it immediately.
    const autoRelease = dv.paymentMode !== 'check';
    const now = new Date();
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.journalEntryVoucher.update({
        where: { id: jev.id },
        data: { status: 'posted', postedBy: userId, postedAt: now, updatedBy: userId },
      });
      await tx.disbursementVoucher.update({
        where: { id, version: dv.version },
        data: {
          status: autoRelease ? 'released' : 'approved',
          certifiedBy: userId,
          certifiedAt: now,
          approvedBy: userId,
          approvedAt: now,
          ...(autoRelease ? { releasedBy: userId, releasedAt: now } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      // An ADA debit record was raised (pending) when the draft was created;
      // posting releases it so the cashier can later mark it cleared.
      if (dv.paymentMode === 'ada') {
        const ada = await tx.check.findFirst({
          where: { disbursementVoucherId: id, status: 'pending' },
          select: { id: true },
        });
        if (ada) {
          await tx.check.update({
            where: { id: ada.id },
            data: {
              status: 'released' as never,
              releasedBy: userId,
              releasedAt: now,
              updatedBy: userId,
            },
          });
          await tx.checkStatusHistory.create({
            data: {
              checkId: ada.id,
              fromStatus: 'pending' as never,
              toStatus: 'released' as never,
              changedBy: userId,
              remarks: `ADA debit released on posting DV`,
            },
          });
        }
      }
      // Posting a draft payment now settles the supplier invoice's payable.
      if (dv.supplierInvoiceId) {
        await this.recomputeInvoicePaid(tx, dv.supplierInvoiceId);
      }
    });

    return this.findOne(orgId, id);
  }

  /**
   * Release an approved DV to the payee. For a check-paid DV this happens when
   * the cashier releases the printed check; this action is for non-check DVs
   * (ADA/others) that have no check to print — the cashier/accountant records
   * the release here. Blocked while a check is still pending or printed (that
   * DV releases through the Checks screen instead).
   */
  async releaseDv(orgId: string, userId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        status: true,
        version: true,
        dvNumber: true,
        checks: { select: { status: true } },
      },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');
    if (dv.status !== 'approved') {
      throw new BadRequestException('Only an approved disbursement voucher can be released.');
    }
    if (dv.checks.some((c) => c.status === 'pending' || c.status === 'printed')) {
      throw new BadRequestException(
        `${dv.dvNumber} has a check to issue — print and release it from the Checks screen.`,
      );
    }
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.disbursementVoucher.update({
        where: { id, version: dv.version },
        data: {
          status: 'released',
          releasedBy: userId,
          releasedAt: new Date(),
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

  private async requireDv(orgId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');
    return dv;
  }

  // ── Notes (collaborative comment thread on the DV) ──

  async listNotes(orgId: string, id: string) {
    await this.requireDv(orgId, id);
    const notes = await this.prisma.comment.findMany({
      where: {
        organizationId: orgId,
        commentableTable: 'disbursement_vouchers',
        commentableId: id,
        isDeleted: false,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        body: true,
        createdAt: true,
        createdBy: true,
        author: { select: { username: true } },
      },
    });
    return notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      authorId: n.createdBy,
      author: n.author?.username ?? 'Unknown',
    }));
  }

  async addNote(orgId: string, id: string, userId: string, body: string) {
    await this.requireDv(orgId, id);
    const text = (body ?? '').trim();
    if (!text) throw new BadRequestException('The note cannot be empty.');
    if (text.length > 4000)
      throw new BadRequestException('The note is too long (max 4000 characters).');
    await this.prisma.comment.create({
      data: {
        organizationId: orgId,
        commentableTable: 'disbursement_vouchers',
        commentableId: id,
        body: text,
        createdBy: userId,
      },
    });
    return this.listNotes(orgId, id);
  }

  async deleteNote(orgId: string, id: string, noteId: string, userId: string) {
    await this.requireDv(orgId, id);
    const note = await this.prisma.comment.findFirst({
      where: {
        id: noteId,
        organizationId: orgId,
        commentableTable: 'disbursement_vouchers',
        commentableId: id,
        isDeleted: false,
      },
      select: { id: true, createdBy: true },
    });
    if (!note) throw new NotFoundException('Note not found.');
    // Only the author may remove their own note.
    if (note.createdBy !== userId) {
      throw new BadRequestException('You can only delete your own notes.');
    }
    await this.prisma.comment.update({ where: { id: noteId }, data: { isDeleted: true } });
    return this.listNotes(orgId, id);
  }

  // ── Attachments (supporting documents) ──

  async addAttachment(orgId: string, id: string, userId: string, file?: Express.Multer.File) {
    await this.requireDv(orgId, id);
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!DV_ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, PNG, or JPEG files are allowed.');
    }
    const dir = path.join(process.cwd(), DV_UPLOAD_SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    const stored = `${randomUUID()}${path.extname(file.originalname)}`;
    fs.writeFileSync(path.join(dir, stored), file.buffer);

    const att = await this.prisma.attachment.create({
      data: {
        organizationId: orgId,
        attachableTable: 'disbursement_vouchers',
        attachableId: id,
        fileName: file.originalname,
        filePath: path.join(DV_UPLOAD_SUBDIR, stored),
        mimeType: file.mimetype,
        fileSizeBytes: BigInt(file.size),
        uploadedBy: userId,
      },
      select: { id: true, fileName: true, mimeType: true, fileSizeBytes: true, createdAt: true },
    });
    return { ...att, fileSizeBytes: Number(att.fileSizeBytes) };
  }

  async listAttachments(orgId: string, id: string) {
    await this.requireDv(orgId, id);
    const atts = await this.prisma.attachment.findMany({
      where: { organizationId: orgId, attachableTable: 'disbursement_vouchers', attachableId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        createdAt: true,
        uploader: { select: { username: true } },
      },
    });
    return atts.map((a) => ({ ...a, fileSizeBytes: Number(a.fileSizeBytes) }));
  }

  async getAttachmentFile(orgId: string, id: string, attId: string) {
    await this.requireDv(orgId, id);
    const att = await this.prisma.attachment.findFirst({
      where: {
        id: attId,
        organizationId: orgId,
        attachableTable: 'disbursement_vouchers',
        attachableId: id,
      },
      select: { fileName: true, filePath: true, mimeType: true },
    });
    if (!att) throw new NotFoundException('Attachment not found.');
    const abs = path.join(process.cwd(), att.filePath);
    if (!fs.existsSync(abs)) throw new NotFoundException('The file is missing on the server.');
    return { abs, fileName: att.fileName, mimeType: att.mimeType };
  }

  async deleteAttachment(orgId: string, id: string, attId: string) {
    await this.requireDv(orgId, id);
    const att = await this.prisma.attachment.findFirst({
      where: {
        id: attId,
        organizationId: orgId,
        attachableTable: 'disbursement_vouchers',
        attachableId: id,
      },
      select: { id: true, filePath: true },
    });
    if (!att) throw new NotFoundException('Attachment not found.');
    await this.prisma.attachment.delete({ where: { id: att.id } });
    try {
      fs.unlinkSync(path.join(process.cwd(), att.filePath));
    } catch {
      /* file already gone — ignore */
    }
    return { deleted: true };
  }
}
