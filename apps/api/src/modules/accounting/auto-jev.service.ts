import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

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
    const cashAccount = await this.resolve(organizationId, 'cash.in_bank');
    const apAccount = await this.resolve(organizationId, 'ap.accounts_payable');

    if (!cashAccount || !apAccount) {
      this.logger.warn(
        `Skipping auto-JEV for DV ${dv.dvNumber}: missing account mappings (cash.in_bank or ap.accounts_payable).`,
      );
      return null;
    }

    const lines: Array<{ chartOfAccountId: string; debitAmount: number; creditAmount: number; description: string }> = [];

    lines.push({
      chartOfAccountId: apAccount.id,
      debitAmount: dv.grossAmount,
      creditAmount: 0,
      description: `Accounts Payable — DV ${dv.dvNumber}`,
    });

    if (dv.taxAmount > 0) {
      const birAccount = await this.resolve(organizationId, 'ap.due_to_bir');
      if (birAccount) {
        lines.push({
          chartOfAccountId: birAccount.id,
          debitAmount: 0,
          creditAmount: dv.taxAmount,
          description: `Tax Withheld — DV ${dv.dvNumber}`,
        });
      }
    }

    lines.push({
      chartOfAccountId: cashAccount.id,
      debitAmount: 0,
      creditAmount: dv.netAmount + (dv.taxAmount > 0 ? 0 : 0),
      description: `Cash Disbursement — DV ${dv.dvNumber}`,
    });

    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
    const gap = totalDebit - totalCredit;
    if (Math.abs(gap) > 0.005) {
      const cashLine = lines.find((l) => l.chartOfAccountId === cashAccount.id)!;
      cashLine.creditAmount += gap;
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

  async onStockReceiptPosted(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    receipt: {
      id: string;
      receiptNumber: string;
      receiptDate: Date;
      items: Array<{ totalCost: number; inventoryItem: { itemCode: string; name: string } }>;
    },
  ) {
    const inventoryAccount = await this.resolve(organizationId, 'inventory.office_supplies');
    const apAccount = await this.resolve(organizationId, 'ap.accounts_payable');

    if (!inventoryAccount || !apAccount) {
      this.logger.warn(
        `Skipping auto-JEV for receipt ${receipt.receiptNumber}: missing account mappings (inventory.office_supplies or ap.accounts_payable).`,
      );
      return null;
    }

    const totalCost = receipt.items.reduce((s, i) => s + i.totalCost, 0);
    if (totalCost <= 0) return null;

    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: receipt.receiptDate,
      sourceType: 'stock_receipt',
      sourceTable: 'stock_receipts',
      sourceId: receipt.id,
      particulars: `Stock Receipt ${receipt.receiptNumber}`,
      lines: [
        {
          chartOfAccountId: inventoryAccount.id,
          debitAmount: totalCost,
          creditAmount: 0,
          description: `Inventory received — ${receipt.receiptNumber}`,
        },
        {
          chartOfAccountId: apAccount.id,
          debitAmount: 0,
          creditAmount: totalCost,
          description: `AP for stock receipt — ${receipt.receiptNumber}`,
        },
      ],
    });
  }

  async onRisIssued(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    ris: {
      id: string;
      risNumber: string;
      issuedItems: Array<{ description: string; quantityIssued: number; unitCost: number }>;
    },
  ) {
    const expenseAccount = await this.resolve(organizationId, 'expense.office_supplies');
    const inventoryAccount = await this.resolve(organizationId, 'inventory.office_supplies');

    if (!expenseAccount || !inventoryAccount) {
      this.logger.warn(
        `Skipping auto-JEV for RIS ${ris.risNumber}: missing account mappings (expense.office_supplies or inventory.office_supplies).`,
      );
      return null;
    }

    const totalCost = ris.issuedItems.reduce((s, i) => s + i.quantityIssued * i.unitCost, 0);
    if (totalCost <= 0) return null;

    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: new Date(),
      sourceType: 'stock_issue',
      sourceTable: 'requisition_issue_slips',
      sourceId: ris.id,
      particulars: `RIS ${ris.risNumber} — issuance of supplies`,
      lines: [
        {
          chartOfAccountId: expenseAccount.id,
          debitAmount: totalCost,
          creditAmount: 0,
          description: `Supplies expense — RIS ${ris.risNumber}`,
        },
        {
          chartOfAccountId: inventoryAccount.id,
          debitAmount: 0,
          creditAmount: totalCost,
          description: `Inventory issued — RIS ${ris.risNumber}`,
        },
      ],
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
      totalDeductions: number;
      totalNet: number;
    },
  ) {
    const salaryExpense = await this.resolve(organizationId, 'payroll.salaries_expense');
    const payrollPayable = await this.resolve(organizationId, 'payroll.payable');

    if (!salaryExpense || !payrollPayable) {
      this.logger.warn(
        `Skipping auto-JEV for payroll ${payroll.runNumber}: missing account mappings (payroll.salaries_expense or payroll.payable).`,
      );
      return null;
    }

    if (payroll.totalGross <= 0) return null;

    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: payroll.payDate,
      sourceType: 'payroll',
      sourceTable: 'payroll_runs',
      sourceId: payroll.id,
      particulars: `Payroll ${payroll.runNumber} — Salaries and Wages`,
      lines: [
        {
          chartOfAccountId: salaryExpense.id,
          debitAmount: payroll.totalGross,
          creditAmount: 0,
          description: `Salaries Expense — ${payroll.runNumber}`,
        },
        {
          chartOfAccountId: payrollPayable.id,
          debitAmount: 0,
          creditAmount: payroll.totalGross,
          description: `Salaries Payable — ${payroll.runNumber}`,
        },
      ],
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
      materialsCost: number;
    },
  ) {
    const expenseAccount = await this.resolve(organizationId, 'expense.repairs_maintenance');
    const inventoryAccount = await this.resolve(organizationId, 'inventory.office_supplies');

    if (!expenseAccount || !inventoryAccount) {
      this.logger.warn(
        `Skipping auto-JEV for WO ${wo.woNumber}: missing account mappings (expense.repairs_maintenance or inventory.office_supplies).`,
      );
      return null;
    }

    if (wo.materialsCost <= 0) return null;

    return this.createAutoJev(tx, {
      organizationId,
      userId,
      jevDate: wo.verifiedAt,
      sourceType: 'work_order',
      sourceTable: 'work_orders',
      sourceId: wo.id,
      particulars: `WO ${wo.woNumber} — Materials used for field operations`,
      lines: [
        {
          chartOfAccountId: expenseAccount.id,
          debitAmount: wo.materialsCost,
          creditAmount: 0,
          description: `Repairs & Maintenance Expense — ${wo.woNumber}`,
        },
        {
          chartOfAccountId: inventoryAccount.id,
          debitAmount: 0,
          creditAmount: wo.materialsCost,
          description: `Inventory consumed — ${wo.woNumber}`,
        },
      ],
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
    const lines: Array<{ chartOfAccountId: string; debitAmount: number; creditAmount: number; description: string }> = [];

    for (const cat of run.categoryTotals) {
      if (cat.totalAmount <= 0) continue;

      const deprExpense = await this.resolveByCode(tx, organizationId, cat.deprExpenseAccountCode);
      const accumDepr = await this.resolveByCode(tx, organizationId, cat.accumDeprAccountCode);

      if (!deprExpense || !accumDepr) {
        this.logger.warn(
          `Skipping category ${cat.categoryName}: COA accounts not found (${cat.deprExpenseAccountCode} / ${cat.accumDeprAccountCode}).`,
        );
        continue;
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

  private async createAutoJev(
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
      lines: Array<{ chartOfAccountId: string; debitAmount: number; creditAmount: number; description: string }>;
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

    const jevNumber = await this.generateJevNumber(tx, data.organizationId);

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
        ...(data.responsibilityCenterId ? { responsibilityCenterId: data.responsibilityCenterId } : {}),
        totalDebit,
        totalCredit,
        status: 'posted',
        postedBy: data.userId,
        postedAt: new Date(),
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
