import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { AutoJevService } from './auto-jev.service';
import { CreateSupplierInvoiceDto } from './dto/supplier-invoice.dto';

export interface PostedLine {
  chartOfAccountId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
}

export interface DueItem {
  dueDate: string;
  amount: number;
}

/**
 * Supplier's Invoices (bills). This client has no Procurement module, so
 * supplier invoices are recorded here in Accounting — much like a QuickBooks
 * bill. Recording an invoice posts the payable entry (Dr charges / Cr Accounts
 * Payable) straight to the ledger; the eventual payment originates from this
 * module (a later phase), never from a manually keyed DV.
 */
@Injectable()
export class SupplierInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  async list(organizationId: string) {
    const rows = await this.prisma.supplierInvoice.findMany({
      where: { organizationId },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async findOne(organizationId: string, id: string) {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id, organizationId },
    });
    if (!inv) throw new NotFoundException('Supplier invoice not found.');

    // The posted journal entry, with account names for display.
    let journalEntry = null as null | {
      id: string;
      jevNumber: string;
      status: string;
      lines: Array<{
        chartOfAccountId: string;
        accountCode: string;
        accountName: string;
        debitAmount: string;
        creditAmount: string;
        description: string | null;
      }>;
    };
    if (inv.journalEntryId) {
      const jev = await this.prisma.journalEntryVoucher.findUnique({
        where: { id: inv.journalEntryId },
        select: {
          id: true,
          jevNumber: true,
          status: true,
          lines: {
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
      if (jev) {
        journalEntry = {
          id: jev.id,
          jevNumber: jev.jevNumber,
          status: jev.status,
          lines: jev.lines.map((l) => ({
            chartOfAccountId: l.chartOfAccountId,
            accountCode: l.chartOfAccount.accountCode,
            accountName: l.chartOfAccount.name,
            debitAmount: String(l.debitAmount),
            creditAmount: String(l.creditAmount),
            description: l.description,
          })),
        };
      }
    }

    // Payments made against this invoice — the DVs that settle its payable.
    const paymentRows = await this.prisma.disbursementVoucher.findMany({
      where: { supplierInvoiceId: id },
      orderBy: [{ dvDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        dvNumber: true,
        dvDate: true,
        grossAmount: true,
        taxAmount: true,
        netAmount: true,
        status: true,
        supplierInvoiceInstallment: true,
        checks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, checkNumber: true, checkDate: true },
        },
      },
    });
    const payments = paymentRows.map((p) => {
      const check = p.checks[0] ?? null;
      return {
        id: p.id,
        dvNumber: p.dvNumber,
        dvDate: p.dvDate,
        applied: String(p.grossAmount), // amount settled against Accounts Payable
        taxWithheld: String(p.taxAmount),
        cashPaid: String(p.netAmount),
        dvStatus: p.status,
        installment: p.supplierInvoiceInstallment ?? null,
        checkStatus: check?.status ?? null,
        checkNumber: check?.checkNumber ?? null,
        checkDate: check?.checkDate ?? null,
      };
    });

    // Per-installment status. Payments count toward the payable once they are
    // posted (not draft/cancelled); the amount applied is the DV's gross debit
    // to Accounts Payable. An installment is paid / partially paid, else due or
    // past due by its date.
    const settledPayments = paymentRows.filter(
      (p) => p.status !== 'draft' && p.status !== 'cancelled',
    );
    const todayStr = new Date().toISOString().slice(0, 10);
    const rawSchedule = (inv.dueSchedule as unknown as DueItem[] | null) ?? [];
    const schedule = rawSchedule.map((d, i) => {
      const installmentNo = i + 1;
      const paid = round2(
        settledPayments
          .filter((p) => p.supplierInvoiceInstallment === installmentNo)
          .reduce((s, p) => s + Number(p.grossAmount), 0),
      );
      const amount = round2(Number(d.amount));
      const due = String(d.dueDate).slice(0, 10);
      let status: 'paid' | 'partially_paid' | 'due' | 'past_due';
      if (paid >= amount - 0.01) status = 'paid';
      else if (paid > 0.01) status = 'partially_paid';
      else if (due < todayStr) status = 'past_due';
      else status = 'due';
      return {
        installment: installmentNo,
        dueDate: d.dueDate,
        amount: String(amount),
        paid: String(paid),
        balance: String(round2(amount - paid)),
        status,
      };
    });

    return { ...this.toSummary(inv), journalEntry, payments, schedule };
  }

  async create(organizationId: string, userId: string, dto: CreateSupplierInvoiceDto) {
    const invoiceNumber = dto.invoiceNumber.trim();
    const supplierName = dto.supplierName.trim();

    // Validate the charge lines (each is a debit XOR a credit).
    for (const line of dto.lines) {
      if (line.debitAmount > 0 && line.creditAmount > 0) {
        throw new BadRequestException('A line cannot have both a debit and a credit amount.');
      }
      if (line.debitAmount <= 0 && line.creditAmount <= 0) {
        throw new BadRequestException('Each line must have a debit or a credit amount.');
      }
    }

    const grossAmount = round2(dto.lines.reduce((s, l) => s + l.debitAmount, 0));
    const taxAmount = round2(dto.lines.reduce((s, l) => s + l.creditAmount, 0));
    const netAmount = round2(grossAmount - taxAmount);
    if (grossAmount <= 0) {
      throw new BadRequestException('Enter at least one charge (a debit line).');
    }
    if (netAmount <= 0) {
      throw new BadRequestException(
        'The net payable (charges less any tax withheld) must be greater than zero.',
      );
    }

    // Optional payment schedule (single due date or installments). When given,
    // the amounts must add up to the net payable so the due dates are meaningful.
    const dueSchedule: DueItem[] = (dto.dueSchedule ?? []).map((d) => ({
      dueDate: d.dueDate,
      amount: round2(d.amount),
    }));
    if (dueSchedule.length > 0) {
      for (const d of dueSchedule) {
        if (isNaN(new Date(d.dueDate).getTime())) {
          throw new BadRequestException('Each due date must be a valid date.');
        }
      }
      const scheduled = round2(dueSchedule.reduce((s, d) => s + d.amount, 0));
      if (Math.abs(scheduled - netAmount) > 0.01) {
        throw new BadRequestException(
          `The due-date amounts (${scheduled.toFixed(2)}) must add up to the net payable ` +
            `(${netAmount.toFixed(2)}).`,
        );
      }
    }

    // The balancing Accounts Payable account.
    const apAccount = await this.prisma.accountMapping.findFirst({
      where: { organizationId, mappingKey: 'ap.accounts_payable', isActive: true },
      select: { chartOfAccountId: true },
    });
    if (!apAccount) {
      throw new BadRequestException(
        'The "Accounts Payable" posting account is not configured (mapping "ap.accounts_payable"). ' +
          'Set it up in Account Mappings before recording supplier invoices.',
      );
    }

    // The lines that will be posted: the charge lines the accountant entered,
    // plus the balancing Accounts Payable credit for the net payable.
    const postedLines: PostedLine[] = dto.lines.map((l) => ({
      chartOfAccountId: l.chartOfAccountId,
      debitAmount: round2(l.debitAmount),
      creditAmount: round2(l.creditAmount),
      description: l.description?.trim() || `SI ${invoiceNumber}`,
    }));
    postedLines.push({
      chartOfAccountId: apAccount.chartOfAccountId,
      debitAmount: 0,
      creditAmount: netAmount,
      description: `Accounts Payable — ${supplierName} (SI ${invoiceNumber})`,
    });

    const particulars = `Supplier Invoice ${invoiceNumber} — ${supplierName}`;

    const result = await runAudited(this.prisma, userId, async (tx) => {
      const inv = await tx.supplierInvoice.create({
        data: {
          organizationId,
          invoiceNumber,
          supplierName,
          ...(dto.supplierTin ? { supplierTin: dto.supplierTin.trim() } : {}),
          ...(dto.supplierAddress ? { supplierAddress: dto.supplierAddress.trim() } : {}),
          invoiceDate: new Date(dto.invoiceDate),
          ...(dto.term ? { term: dto.term.trim() } : {}),
          particulars: dto.particulars.trim(),
          grossAmount,
          taxAmount,
          netAmount,
          status: 'unpaid',
          glLines: postedLines as unknown as Prisma.InputJsonValue,
          ...(dueSchedule.length > 0
            ? { dueSchedule: dueSchedule as unknown as Prisma.InputJsonValue }
            : {}),
          apAccountId: apAccount.chartOfAccountId,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      const jev = await this.autoJev.createAutoJev(tx, {
        organizationId,
        userId,
        jevDate: new Date(dto.invoiceDate),
        // Reuse the generic "manual" source type (no schema/enum change needed);
        // the sourceTable pins it to supplier invoices.
        sourceType: 'manual',
        sourceTable: 'supplier_invoices',
        sourceId: inv.id,
        particulars,
        status: 'posted',
        lines: postedLines,
      });
      if (!jev) {
        // Rolls back the invoice — most likely no open accounting period.
        throw new BadRequestException(
          'Could not record the payable. Ensure an accounting period is open for the invoice date.',
        );
      }

      const updated = await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: { journalEntryId: jev.id },
      });
      return updated;
    });

    return this.toSummary(result);
  }

  /**
   * Upcoming supplier-invoice payments for the accountant's "Upcoming Due Dates".
   * Flattens each unpaid invoice's payment schedule into individual due dates on
   * or after `from`, earliest first.
   */
  async upcomingDueDates(organizationId: string, from: Date, take = 12) {
    const rows = await this.prisma.supplierInvoice.findMany({
      where: { organizationId, status: { not: 'paid' }, dueSchedule: { not: Prisma.JsonNull } },
      select: {
        invoiceNumber: true,
        supplierName: true,
        dueSchedule: true,
      },
    });

    const items: Array<{ label: string; dueDate: Date; amount: number }> = [];
    for (const r of rows) {
      const schedule = (r.dueSchedule as unknown as DueItem[] | null) ?? [];
      const multi = schedule.length > 1;
      schedule.forEach((d, i) => {
        const due = new Date(d.dueDate);
        if (isNaN(due.getTime()) || due < from) return;
        const which = multi ? ` (payment ${i + 1} of ${schedule.length})` : '';
        items.push({
          label: `${r.supplierName} — SI ${r.invoiceNumber}${which} due`,
          dueDate: due,
          amount: Number(d.amount),
        });
      });
    }
    items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return items.slice(0, take);
  }

  private toSummary(r: {
    id: string;
    invoiceNumber: string;
    supplierName: string;
    supplierTin: string | null;
    supplierAddress: string | null;
    invoiceDate: Date;
    term: string | null;
    particulars: string;
    grossAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    netAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    status: string;
    glLines: Prisma.JsonValue;
    dueSchedule: Prisma.JsonValue;
    journalEntryId: string | null;
    apAccountId: string | null;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      supplierName: r.supplierName,
      supplierTin: r.supplierTin,
      supplierAddress: r.supplierAddress,
      invoiceDate: r.invoiceDate,
      term: r.term,
      particulars: r.particulars,
      grossAmount: String(r.grossAmount),
      taxAmount: String(r.taxAmount),
      netAmount: String(r.netAmount),
      amountPaid: String(r.amountPaid),
      balance: String(round2(Number(r.netAmount) - Number(r.amountPaid))),
      status: r.status,
      glLines: (r.glLines as unknown as PostedLine[]) ?? [],
      dueSchedule: (r.dueSchedule as unknown as DueItem[] | null) ?? [],
      journalEntryId: r.journalEntryId,
      apAccountId: r.apAccountId,
      createdAt: r.createdAt,
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
