import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

// Classification → default posting-account mapping key, used when an inventory
// item does not name its own accountCode.
const INVENTORY_MAPPING_KEY: Record<string, string> = {
  expendable: 'inventory.expendable',
  semi_expendable: 'inventory.semi_expendable',
  ppe: 'inventory.ppe',
};
const EXPENSE_MAPPING_KEY: Record<string, string> = {
  expendable: 'expense.expendable',
  semi_expendable: 'expense.semi_expendable',
  ppe: 'expense.expendable',
};

// Payroll deduction referenceCode → payable-account mapping key. Unlisted codes
// (e.g. loans, association dues) fall back to payroll.other_payable.
const PAYROLL_DEDUCTION_KEY: Record<string, string> = {
  BIR: 'payroll.due_bir',
  WTAX: 'payroll.due_bir',
  'W-TAX': 'payroll.due_bir',
  GSIS: 'payroll.due_gsis',
  PHIC: 'payroll.due_philhealth',
  PHILHEALTH: 'payroll.due_philhealth',
  HDMF: 'payroll.due_pagibig',
  PAGIBIG: 'payroll.due_pagibig',
  'PAG-IBIG': 'payroll.due_pagibig',
};
// Deduction codes that reduce salary earned rather than being withheld to a payable.
const PAY_REDUCTION_CODES = new Set(['LATE', 'UNDERTIME', 'ABSENT']);

@Injectable()
export class AutoJevService {
  private readonly logger = new Logger(AutoJevService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onDvReleased(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    dv: {
      id: string;
      dvNumber: string;
      dvDate: Date;
      particulars: string;
      grossAmount: number;
      taxAmount: number;
      otherDeductions: number;
      netAmount: number;
      fundSourceId: string | null;
      responsibilityCenterId: string | null;
    },
  ) {
    // Required posting accounts. A missing mapping BLOCKS the release (loud)
    // rather than letting the DV disburse with no journal entry (silent drift).
    const cashAccount = await this.requireMapping(
      organizationId,
      'cash.in_bank',
      'Cash in Bank',
      dv.dvNumber,
    );
    const apAccount = await this.requireMapping(
      organizationId,
      'ap.accounts_payable',
      'Accounts Payable',
      dv.dvNumber,
    );

    // Free-form deduction lines captured on the DV — each credits its own
    // liability/payable account, so no non-tax deduction is folded into cash.
    const deductions = await tx.dvDeduction.findMany({
      where: { dvId: dv.id },
      orderBy: { sortOrder: 'asc' },
      select: { label: true, amount: true, chartOfAccountId: true },
    });

    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];

    // Dr Accounts Payable — the full gross obligation to the payee.
    lines.push({
      chartOfAccountId: apAccount.id,
      debitAmount: dv.grossAmount,
      creditAmount: 0,
      description: `Accounts Payable — DV ${dv.dvNumber}`,
    });

    // Cr Due to BIR — statutory income-tax withholding.
    if (dv.taxAmount > 0) {
      const birAccount = await this.requireMapping(
        organizationId,
        'ap.due_to_bir',
        'Due to BIR',
        dv.dvNumber,
      );
      lines.push({
        chartOfAccountId: birAccount.id,
        debitAmount: 0,
        creditAmount: dv.taxAmount,
        description: `Tax Withheld — DV ${dv.dvNumber}`,
      });
    }

    // Cr each free-form deduction to its own account.
    for (const d of deductions) {
      const amount = Number(d.amount);
      if (amount <= 0) continue;
      lines.push({
        chartOfAccountId: d.chartOfAccountId,
        debitAmount: 0,
        creditAmount: amount,
        description: `${d.label} — DV ${dv.dvNumber}`,
      });
    }

    // Cr Cash in Bank — the net actually disbursed to the payee.
    lines.push({
      chartOfAccountId: cashAccount.id,
      debitAmount: 0,
      creditAmount: dv.netAmount,
      description: `Cash Disbursement — DV ${dv.dvNumber}`,
    });

    // Must balance exactly: gross = tax + Σdeductions + net (enforced when the
    // DV is created). Refuse to post rather than silently plug the cash line.
    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(
        `DV ${dv.dvNumber} produces an unbalanced entry ` +
          `(debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}). ` +
          `Check that gross equals tax + deductions + net.`,
      );
    }

    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: dv.dvDate,
      sourceType: 'disbursement',
      sourceTable: 'disbursement_vouchers',
      sourceId: dv.id,
      particulars: `DV ${dv.dvNumber}: ${dv.particulars}`,
      ...(dv.fundSourceId ? { fundSourceId: dv.fundSourceId } : {}),
      ...(dv.responsibilityCenterId ? { responsibilityCenterId: dv.responsibilityCenterId } : {}),
      lines,
    });
  }

  /**
   * Post the accounting entry for a Disbursement Voucher created directly in the
   * Accounting module (non-procurement: travel, reimbursement, payroll, etc.).
   * The caller supplies the exact, already-balanced lines; this reuses the same
   * period resolution, JEV numbering and posting path as the procurement DV.
   */
  async postDisbursementEntry(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    dv: {
      id: string;
      dvNumber: string;
      dvDate: Date;
      particulars: string;
      fundSourceId: string | null;
      responsibilityCenterId: string | null;
    },
    lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description?: string;
    }>,
    status: 'draft' | 'posted' = 'posted',
  ) {
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: dv.dvDate,
      sourceType: 'disbursement',
      sourceTable: 'disbursement_vouchers',
      sourceId: dv.id,
      particulars: `DV ${dv.dvNumber}: ${dv.particulars}`,
      status,
      ...(dv.fundSourceId ? { fundSourceId: dv.fundSourceId } : {}),
      ...(dv.responsibilityCenterId ? { responsibilityCenterId: dv.responsibilityCenterId } : {}),
      lines: lines.map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        description: l.description ?? '',
      })),
    });
  }

  async onStockReceiptPosted(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    receipt: {
      id: string;
      receiptNumber: string;
      receiptDate: Date;
      items: Array<{ totalCost: number; accountCode: string | null; classification: string }>;
    },
  ) {
    const ref = `Stock Receipt ${receipt.receiptNumber}`;

    // Group each received item's cost under its resolved inventory/PPE account
    // (the item's own accountCode, else a classification default).
    const byAccount = new Map<string, number>();
    let total = 0;
    for (const item of receipt.items) {
      if (item.totalCost <= 0) continue;
      const acct = await this.resolveInventoryAccount(tx, organizationId, item, ref);
      byAccount.set(acct.id, (byAccount.get(acct.id) ?? 0) + item.totalCost);
      total += item.totalCost;
    }
    if (total <= 0) return null;

    const apAccount = await this.requireMapping(
      organizationId,
      'ap.accounts_payable',
      'Accounts Payable',
      ref,
    );

    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];
    for (const [chartOfAccountId, amount] of byAccount) {
      lines.push({
        chartOfAccountId,
        debitAmount: amount,
        creditAmount: 0,
        description: `Inventory received — ${receipt.receiptNumber}`,
      });
    }
    lines.push({
      chartOfAccountId: apAccount.id,
      debitAmount: 0,
      creditAmount: total,
      description: `A/P for stock receipt — ${receipt.receiptNumber}`,
    });

    this.assertBalanced(lines, ref);
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: receipt.receiptDate,
      sourceType: 'stock_receipt',
      sourceTable: 'stock_receipts',
      sourceId: receipt.id,
      particulars: ref,
      lines,
    });
  }

  async onRisIssued(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    ris: {
      id: string;
      risNumber: string;
      issuedItems: Array<{
        quantityIssued: number;
        unitCost: number;
        accountCode: string | null;
        classification: string;
      }>;
    },
  ) {
    const ref = `RIS ${ris.risNumber}`;

    // Dr supplies expense (by classification), Cr the item's inventory account.
    const expenseByAccount = new Map<string, number>();
    const inventoryByAccount = new Map<string, number>();
    for (const item of ris.issuedItems) {
      const cost = item.quantityIssued * item.unitCost;
      if (cost <= 0) continue;
      const inv = await this.resolveInventoryAccount(tx, organizationId, item, ref);
      const expKey = EXPENSE_MAPPING_KEY[item.classification] ?? 'expense.expendable';
      const exp = await this.requireMapping(
        organizationId,
        expKey,
        `Supplies expense (${item.classification})`,
        ref,
      );
      inventoryByAccount.set(inv.id, (inventoryByAccount.get(inv.id) ?? 0) + cost);
      expenseByAccount.set(exp.id, (expenseByAccount.get(exp.id) ?? 0) + cost);
    }
    const total = [...expenseByAccount.values()].reduce((s, v) => s + v, 0);
    if (total <= 0) return null;

    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];
    for (const [chartOfAccountId, amount] of expenseByAccount) {
      lines.push({
        chartOfAccountId,
        debitAmount: amount,
        creditAmount: 0,
        description: `Supplies expense — RIS ${ris.risNumber}`,
      });
    }
    for (const [chartOfAccountId, amount] of inventoryByAccount) {
      lines.push({
        chartOfAccountId,
        debitAmount: 0,
        creditAmount: amount,
        description: `Inventory issued — RIS ${ris.risNumber}`,
      });
    }

    this.assertBalanced(lines, ref);
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: new Date(),
      sourceType: 'stock_issue',
      sourceTable: 'requisition_issue_slips',
      sourceId: ris.id,
      particulars: `RIS ${ris.risNumber} — issuance of supplies`,
      lines,
    });
  }

  async onPayrollPaid(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    payroll: {
      id: string;
      runNumber: string;
      payDate: Date;
      totalGross: number;
      totalNet: number;
    },
  ) {
    if (payroll.totalGross <= 0) return null;
    const ref = `Payroll ${payroll.runNumber}`;

    // Deduction breakdown from the run's payroll items. Statutory/loan codes are
    // withheld to their payables; LATE/UNDERTIME/ABSENT reduce salary earned.
    const details = await tx.payrollItemDetail.findMany({
      where: { detailType: 'deduction', payrollItem: { payrollRunId: payroll.id } },
      select: { referenceCode: true, amount: true },
    });
    let expenseReduction = 0;
    const payableByCode = new Map<string, number>();
    for (const d of details) {
      const amt = Number(d.amount);
      if (amt <= 0) continue;
      const code = d.referenceCode.toUpperCase();
      if (PAY_REDUCTION_CODES.has(code)) {
        expenseReduction += amt;
      } else {
        payableByCode.set(code, (payableByCode.get(code) ?? 0) + amt);
      }
    }

    const salaryExpense = await this.requireMapping(
      organizationId,
      'payroll.salaries_expense',
      'Salaries and Wages',
      ref,
    );
    const netPayable = await this.requireMapping(
      organizationId,
      'payroll.net_payable',
      'Net Pay Payable',
      ref,
    );

    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];

    // Dr Salaries & Wages — gross earnings net of late/undertime/absent.
    lines.push({
      chartOfAccountId: salaryExpense.id,
      debitAmount: payroll.totalGross - expenseReduction,
      creditAmount: 0,
      description: `Salaries and Wages — ${payroll.runNumber}`,
    });

    // Cr each statutory/loan deduction to its own payable.
    for (const [code, amount] of payableByCode) {
      const key = PAYROLL_DEDUCTION_KEY[code] ?? 'payroll.other_payable';
      const acct = await this.requireMapping(
        organizationId,
        key,
        `Payroll deduction (${code})`,
        ref,
      );
      lines.push({
        chartOfAccountId: acct.id,
        debitAmount: 0,
        creditAmount: amount,
        description: `${code} withheld — ${payroll.runNumber}`,
      });
    }

    // Cr Net Pay Payable.
    lines.push({
      chartOfAccountId: netPayable.id,
      debitAmount: 0,
      creditAmount: payroll.totalNet,
      description: `Net pay payable — ${payroll.runNumber}`,
    });

    this.assertBalanced(lines, ref);
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: payroll.payDate,
      sourceType: 'payroll',
      sourceTable: 'payroll_runs',
      sourceId: payroll.id,
      particulars: `Payroll ${payroll.runNumber} — Salaries and Wages`,
      lines,
    });
  }

  async onWorkOrderVerified(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    wo: {
      id: string;
      woNumber: string;
      verifiedAt: Date;
    },
  ) {
    const ref = `WO ${wo.woNumber}`;

    // Materials consumed on the work order — Cr each item's inventory account,
    // Dr Repairs & Maintenance expense.
    const materials = await tx.workOrderMaterial.findMany({
      where: { workOrderId: wo.id },
      select: {
        totalCost: true,
        inventoryItem: { select: { accountCode: true, classification: true } },
      },
    });
    const inventoryByAccount = new Map<string, number>();
    let total = 0;
    for (const m of materials) {
      const cost = Number(m.totalCost);
      if (cost <= 0) continue;
      const acct = await this.resolveInventoryAccount(tx, organizationId, m.inventoryItem, ref);
      inventoryByAccount.set(acct.id, (inventoryByAccount.get(acct.id) ?? 0) + cost);
      total += cost;
    }
    if (total <= 0) return null;

    const expenseAccount = await this.requireMapping(
      organizationId,
      'expense.repairs_maintenance',
      'Repairs and Maintenance',
      ref,
    );

    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];
    lines.push({
      chartOfAccountId: expenseAccount.id,
      debitAmount: total,
      creditAmount: 0,
      description: `Repairs & Maintenance — ${wo.woNumber}`,
    });
    for (const [chartOfAccountId, amount] of inventoryByAccount) {
      lines.push({
        chartOfAccountId,
        debitAmount: 0,
        creditAmount: amount,
        description: `Inventory consumed — ${wo.woNumber}`,
      });
    }

    this.assertBalanced(lines, ref);
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: wo.verifiedAt,
      sourceType: 'work_order',
      sourceTable: 'work_orders',
      sourceId: wo.id,
      particulars: `WO ${wo.woNumber} — Materials used for field operations`,
      lines,
    });
  }

  async onDepreciationPosted(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    run: {
      id: string;
      runNumber: string;
      periodMonth: number;
      periodYear: number;
      categoryTotals: Array<{
        categoryName: string;
        deprExpenseAccountCode: string;
        accumDeprAccountCode: string;
        totalAmount: number;
      }>;
    },
  ) {
    const periodLabel = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];

    for (const cat of run.categoryTotals) {
      if (cat.totalAmount <= 0) continue;

      const deprExpense = await this.resolveByCode(tx, organizationId, cat.deprExpenseAccountCode);
      const accumDepr = await this.resolveByCode(tx, organizationId, cat.accumDeprAccountCode);

      if (!deprExpense || !accumDepr) {
        throw new BadRequestException(
          `Cannot post depreciation for "${cat.categoryName}": the depreciation-expense ` +
            `(${cat.deprExpenseAccountCode}) or accumulated-depreciation ` +
            `(${cat.accumDeprAccountCode}) account is not set up in the chart of accounts.`,
        );
      }

      lines.push({
        chartOfAccountId: deprExpense.id,
        debitAmount: cat.totalAmount,
        creditAmount: 0,
        description: `Depreciation Expense — ${cat.categoryName} (${periodLabel})`,
      });

      lines.push({
        chartOfAccountId: accumDepr.id,
        debitAmount: 0,
        creditAmount: cat.totalAmount,
        description: `Accumulated Depreciation — ${cat.categoryName} (${periodLabel})`,
      });
    }

    if (lines.length === 0) return null;
    this.assertBalanced(lines, `Depreciation ${periodLabel}`);

    const lastDay = new Date(run.periodYear, run.periodMonth, 0);

    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: lastDay,
      sourceType: 'depreciation',
      sourceTable: 'depreciation_runs',
      sourceId: run.id,
      particulars: `Monthly Depreciation — ${periodLabel} (${run.runNumber})`,
      lines,
    });
  }

  /**
   * Water billing (accrual) — one summarized JEV per generated batch of bills.
   * Recognizes the current period's charges as revenue and a receivable:
   *   Dr Accounts Receivable (current charges net of discount)
   *   Dr Discounts (contra-revenue)
   *   Cr Water Sales / Environmental / Sewer / Maintenance / Penalty / Other
   * Arrears are NOT re-recognized — they already sit in A/R from prior periods.
   */
  async onBillsGenerated(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    args: { billingPeriodId: string; billIds: string[]; billingDate: Date; periodLabel: string },
  ) {
    if (args.billIds.length === 0) return null;
    const label = args.periodLabel;

    const agg = await tx.bill.aggregate({
      where: { id: { in: args.billIds } },
      _sum: {
        waterCharge: true,
        environmentalFee: true,
        sewerCharge: true,
        maintenanceFee: true,
        penaltyAmount: true,
        discountAmount: true,
        otherCharges: true,
      },
    });
    const water = Number(agg._sum.waterCharge ?? 0);
    const env = Number(agg._sum.environmentalFee ?? 0);
    const sewer = Number(agg._sum.sewerCharge ?? 0);
    const maint = Number(agg._sum.maintenanceFee ?? 0);
    const penalty = Number(agg._sum.penaltyAmount ?? 0);
    const discount = Number(agg._sum.discountAmount ?? 0);
    const other = Number(agg._sum.otherCharges ?? 0);

    const revenueTotal = water + env + sewer + maint + penalty + other;
    if (revenueTotal <= 0) return null;
    const arDebit = revenueTotal - discount; // current new receivable (arrears excluded)

    const ref = `Billing ${label}`;
    const lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];

    const ar = await this.requireMapping(
      organizationId,
      'ar.trade_receivable',
      'Accounts Receivable',
      ref,
    );
    lines.push({
      chartOfAccountId: ar.id,
      debitAmount: arDebit,
      creditAmount: 0,
      description: `Water bills receivable — ${label}`,
    });

    if (discount > 0) {
      const disc = await this.requireMapping(organizationId, 'contra.discount', 'Discounts', ref);
      lines.push({
        chartOfAccountId: disc.id,
        debitAmount: discount,
        creditAmount: 0,
        description: `Senior/PWD discounts — ${label}`,
      });
    }

    const revenues: Array<{ amt: number; key: string; name: string }> = [
      { amt: water, key: 'revenue.water_sales', name: 'Water Sales Revenue' },
      { amt: env, key: 'revenue.environmental', name: 'Environmental Charges' },
      { amt: sewer, key: 'revenue.sewer', name: 'Sewerage Charges' },
      { amt: maint, key: 'revenue.maintenance', name: 'Maintenance Fees' },
      { amt: penalty, key: 'income.penalty', name: 'Penalty Income' },
      { amt: other, key: 'revenue.other', name: 'Other Service Income' },
    ];
    for (const r of revenues) {
      if (r.amt <= 0) continue;
      const acct = await this.requireMapping(organizationId, r.key, r.name, ref);
      lines.push({
        chartOfAccountId: acct.id,
        debitAmount: 0,
        creditAmount: r.amt,
        description: `${r.name} — ${label}`,
      });
    }

    this.assertBalanced(lines, ref);
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: args.billingDate,
      sourceType: 'billing',
      sourceTable: 'billing_periods',
      sourceId: args.billingPeriodId,
      particulars: `Water billing register — ${label}`,
      lines,
    });
  }

  /**
   * Collection of a water bill (Official Receipt): Dr Cash-Collecting Officers,
   * Cr Accounts Receivable. A later remittance step deposits it to the bank.
   */
  async onPaymentReceived(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    payment: {
      id: string;
      orNumber: string;
      paymentDate: Date;
      totalAmount: number;
      // Portion of totalAmount that is a 10% late-payment penalty on overdue
      // bills; credited to Penalty Income instead of A/R. Defaults to 0.
      interestAmount?: number;
    },
  ) {
    if (payment.totalAmount <= 0) return null;
    const interest =
      payment.interestAmount && payment.interestAmount > 0.005 ? payment.interestAmount : 0;
    // Credit A/R with total minus interest so the entry is always exactly
    // balanced regardless of per-bill penalty rounding.
    const arCredit = payment.totalAmount - interest;
    const ref = `OR ${payment.orNumber}`;
    const cash = await this.requireMapping(
      organizationId,
      'cash.collecting_officer',
      'Cash - Collecting Officers',
      ref,
    );
    const ar = await this.requireMapping(
      organizationId,
      'ar.trade_receivable',
      'Accounts Receivable',
      ref,
    );
    const lines = [
      {
        chartOfAccountId: cash.id,
        debitAmount: payment.totalAmount,
        creditAmount: 0,
        description: `Cash collection — ${ref}`,
      },
      {
        chartOfAccountId: ar.id,
        debitAmount: 0,
        creditAmount: arCredit,
        description: `A/R settled — ${ref}`,
      },
    ];
    if (interest > 0) {
      const penalty = await this.requireMapping(
        organizationId,
        'income.penalty',
        'Penalty Income',
        ref,
      );
      lines.push({
        chartOfAccountId: penalty.id,
        debitAmount: 0,
        creditAmount: interest,
        description: `Penalty income — 10% on overdue bills — ${ref}`,
      });
    }
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: payment.paymentDate,
      sourceType: 'collection',
      sourceTable: 'payments',
      sourceId: payment.id,
      particulars: `Collection — ${ref}`,
      lines,
    });
  }

  /**
   * Void of a collection — reverses the original entry: Dr A/R, Cr Cash-CO.
   */
  async onPaymentVoided(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    payment: {
      id: string;
      orNumber: string;
      totalAmount: number;
      voidDate: Date;
      // Penalty portion of the original collection to reverse out of Penalty
      // Income (the rest reinstates A/R). Defaults to 0.
      interestAmount?: number;
    },
  ) {
    if (payment.totalAmount <= 0) return null;
    const interest =
      payment.interestAmount && payment.interestAmount > 0.005 ? payment.interestAmount : 0;
    const arReinstate = payment.totalAmount - interest;
    const ref = `void OR ${payment.orNumber}`;
    const cash = await this.requireMapping(
      organizationId,
      'cash.collecting_officer',
      'Cash - Collecting Officers',
      ref,
    );
    const ar = await this.requireMapping(
      organizationId,
      'ar.trade_receivable',
      'Accounts Receivable',
      ref,
    );
    const lines = [
      {
        chartOfAccountId: ar.id,
        debitAmount: arReinstate,
        creditAmount: 0,
        description: `A/R reinstated (void) — OR ${payment.orNumber}`,
      },
    ];
    if (interest > 0) {
      const penalty = await this.requireMapping(
        organizationId,
        'income.penalty',
        'Penalty Income',
        ref,
      );
      lines.push({
        chartOfAccountId: penalty.id,
        debitAmount: interest,
        creditAmount: 0,
        description: `Penalty income reversed (void) — OR ${payment.orNumber}`,
      });
    }
    lines.push({
      chartOfAccountId: cash.id,
      debitAmount: 0,
      creditAmount: payment.totalAmount,
      description: `Cash reversal (void) — OR ${payment.orNumber}`,
    });
    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: payment.voidDate,
      sourceType: 'collection',
      sourceTable: 'payments',
      sourceId: payment.id,
      particulars: `Void collection — OR ${payment.orNumber}`,
      lines,
    });
  }

  private assertBalanced(lines: Array<{ debitAmount: number; creditAmount: number }>, ref: string) {
    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(
        `${ref} produces an unbalanced entry ` +
          `(debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}).`,
      );
    }
  }

  private async resolveByCode(
    tx: Prisma.TransactionClient,
    organizationId: string,
    accountCode: string,
  ) {
    return tx.chartOfAccount.findFirst({
      where: { organizationId, accountCode, isActive: true },
      select: { id: true, accountCode: true, name: true },
    });
  }

  private async resolve(organizationId: string, mappingKey: string) {
    const mapping = await this.prisma.accountMapping.findFirst({
      where: { organizationId, mappingKey, isActive: true },
      select: { chartOfAccount: { select: { id: true, accountCode: true, name: true } } },
    });
    return mapping?.chartOfAccount ?? null;
  }

  /**
   * Resolve a required posting account, or refuse the operation with a clear,
   * actionable error. Used on the release path so a missing mapping BLOCKS the
   * disbursement instead of silently recording nothing to the ledger.
   */
  private async requireMapping(
    organizationId: string,
    mappingKey: string,
    friendlyName: string,
    docRef: string,
  ) {
    const account = await this.resolve(organizationId, mappingKey);
    if (!account) {
      throw new BadRequestException(
        `Cannot record the accounting entry for ${docRef}: the "${friendlyName}" posting account ` +
          `is not configured (mapping "${mappingKey}"). Set up the posting accounts before releasing this voucher.`,
      );
    }
    return account;
  }

  /**
   * Resolve an inventory item's asset account: the item's own accountCode when
   * set and postable, otherwise the classification default mapping.
   */
  private async resolveInventoryAccount(
    tx: Prisma.TransactionClient,
    organizationId: string,
    item: { accountCode: string | null; classification: string },
    docRef: string,
  ) {
    if (item.accountCode) {
      const acct = await tx.chartOfAccount.findFirst({
        where: { organizationId, accountCode: item.accountCode, isHeader: false, isActive: true },
        select: { id: true, accountCode: true, name: true },
      });
      if (acct) return acct;
    }
    const key = INVENTORY_MAPPING_KEY[item.classification] ?? 'inventory.expendable';
    return this.requireMapping(organizationId, key, `Inventory (${item.classification})`, docRef);
  }

  async createAutoJev(
    tx: Prisma.TransactionClient,
    data: {
      organizationId: string;
      userId: string;
      jevDate: Date;
      sourceType: string;
      sourceTable: string;
      sourceId: string;
      particulars: string;
      fundSourceId?: string;
      responsibilityCenterId?: string;
      status?: 'draft' | 'posted';
      lines: Array<{
        chartOfAccountId: string;
        debitAmount: number;
        creditAmount: number;
        description: string;
      }>;
    },
  ) {
    const period = await tx.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId: data.organizationId },
        status: 'open',
        lockedAt: null,
        startDate: { lte: data.jevDate },
        endDate: { gte: data.jevDate },
      },
    });

    if (!period) {
      this.logger.warn(
        `Skipping auto-JEV for ${data.sourceTable}/${data.sourceId}: no open accounting period for ${data.jevDate.toISOString().slice(0, 10)}.`,
      );
      return null;
    }

    const jevNumber = await this.generateJevNumber(
      tx,
      data.organizationId,
      data.jevDate.getUTCFullYear(),
    );

    const totalDebit = data.lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = data.lines.reduce((s, l) => s + l.creditAmount, 0);

    const jev = await tx.journalEntryVoucher.create({
      data: {
        organizationId: data.organizationId,
        jevNumber,
        jevDate: data.jevDate,
        accountingPeriodId: period.id,
        sourceType: data.sourceType as any,
        sourceTable: data.sourceTable,
        sourceId: data.sourceId,
        particulars: data.particulars,
        ...(data.fundSourceId ? { fundSourceId: data.fundSourceId } : {}),
        ...(data.responsibilityCenterId
          ? { responsibilityCenterId: data.responsibilityCenterId }
          : {}),
        totalDebit,
        totalCredit,
        status: data.status ?? 'posted',
        ...((data.status ?? 'posted') === 'posted'
          ? { postedBy: data.userId, postedAt: new Date() }
          : {}),
        createdBy: data.userId,
        updatedBy: data.userId,
        lines: {
          create: data.lines.map((line) => ({
            chartOfAccountId: line.chartOfAccountId,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            description: line.description,
          })),
        },
      },
      select: { id: true, jevNumber: true },
    });

    this.logger.log(`Auto-JEV ${jev.jevNumber} created for ${data.sourceTable}/${data.sourceId}`);
    return jev;
  }

  private async generateJevNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
    year: number,
  ): Promise<string> {
    const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = NOW()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'jev'
      RETURNING next_number
    `;

    if (seq) {
      return `JEV-${year}-${String(seq.next_number).padStart(6, '0')}`;
    }

    const [inserted] = await tx.$queryRaw<[{ next_number: bigint }]>`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'jev', 'JEV-', 1)
      RETURNING next_number
    `;
    if (!inserted) throw new Error('Failed to generate JEV number.');
    return `JEV-${year}-${String(inserted.next_number).padStart(6, '0')}`;
  }
}
