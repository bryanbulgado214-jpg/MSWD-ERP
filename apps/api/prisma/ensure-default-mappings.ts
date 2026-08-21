import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Default posting-account mappings for the disbursement (expenditure) cycle.
 * Keys match those resolved by AutoJevService; codes are the standard PH
 * water-district UACS accounts. Idempotent — safe to re-run. Extend this table
 * as more modules are integrated (payroll, inventory, etc.).
 */
const DEFAULT_MAPPINGS: Record<string, string> = {
  // Disbursement cycle
  'cash.in_bank': '1-01-02-020-02', // Cash in Bank - LC, DBP Current Account
  'ap.accounts_payable': '2-01-01-010', // Accounts Payable
  'ap.due_to_bir': '2-02-01-010-02', // Due to BIR - Expanded Withholding Tax
  // Revenue cycle (billing + collections)
  'ar.trade_receivable': '1-03-01-010', // Accounts Receivable
  'cash.collecting_officer': '1-01-01-010', // Cash - Collecting Officer
  'revenue.water_sales': '4-02-02-160', // Sales Revenue (Water Sales)
  'revenue.environmental': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
  'revenue.sewer': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
  'revenue.maintenance': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
  'revenue.other': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
  'income.penalty': '4-02-02-230', // Fines and Penalties - Business Income
  'contra.discount': '4-02-02-161', // Sales Discount (contra-revenue)
  // Inventory cycle (stock receipt / issuance) — classification defaults; an
  // item may override the inventory side with its own accountCode.
  'inventory.expendable': '1-04-04-010', // Office Supplies Inventory
  'inventory.semi_expendable': '1-04-04-990', // Other Supplies and Materials Inventory
  'inventory.ppe': '1-06-05-990', // Other Machinery and Equipment (default)
  'expense.expendable': '5-02-03-010', // Office Supplies Expenses
  'expense.semi_expendable': '5-02-03-010', // Office Supplies Expenses (default)
  // Payroll cycle — salary expense, statutory payables, net pay payable
  'payroll.salaries_expense': '5-01-01-010', // Salaries and Wages - Regular
  'payroll.net_payable': '2-01-01-020', // Due to Officers and Employees
  'payroll.due_bir': '2-02-01-010-01', // Due to BIR - Withholding Tax on Compensation
  'payroll.due_gsis': '2-02-01-020-01', // Due to GSIS - Life and Retirement Premium
  'payroll.due_philhealth': '2-02-01-040', // Due to PhilHealth
  'payroll.due_pagibig': '2-02-01-030-01', // Due to Pag-IBIG - Premium
  'payroll.other_payable': '2-05-01-990', // Other Payables (fallback)
};

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  for (const org of orgs) {
    const actor = await prisma.user.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!actor) {
      console.log(`skip ${org.code}: no user to attribute the mapping to`);
      continue;
    }
    for (const [key, code] of Object.entries(DEFAULT_MAPPINGS)) {
      const acct = await prisma.chartOfAccount.findFirst({
        where: { organizationId: org.id, accountCode: code, isHeader: false, isActive: true },
        select: { id: true, name: true },
      });
      if (!acct) {
        console.log(`  ${org.code}: MISSING account ${code} for ${key} — left unmapped`);
        continue;
      }
      await prisma.accountMapping.upsert({
        where: { organizationId_mappingKey: { organizationId: org.id, mappingKey: key } },
        update: { chartOfAccountId: acct.id, updatedBy: actor.id },
        create: {
          organizationId: org.id,
          mappingKey: key,
          chartOfAccountId: acct.id,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });
      console.log(`  ${org.code}: ${key} -> ${code} (${acct.name})`);
    }
  }
}

main()
  .then(() => console.log('Done.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
