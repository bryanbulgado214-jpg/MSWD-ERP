// prisma/seed-budgeting-dev.ts — Budgeting DEVELOPMENT seed data.
//
// DEV/DEMO DATA ONLY. Do not run this against a production database —
// it creates sample departments, fund sources, and a sample approved
// budget purely so Budgeting Phase 1/2 tables have something to look at
// and query during development. It is intentionally kept separate from
// prisma/seed.ts (the real Core Platform baseline seed, which IS safe
// for production — this file is not).
//
// Requires prisma/seed.ts to have already been run (needs the MSWD
// organization, FY{current year} fiscal year, and admin user to exist).
//
// Run via: npx ts-node prisma/seed-budgeting-dev.ts
// (from apps/api — not wired into package.json's "prisma.seed", on
// purpose, so a plain `prisma db seed` never accidentally loads demo data)
//
// Safe to run more than once — every step uses upsert/idempotent lookups.

// Explicit env loading — see prisma/seed.ts's comment on why this is
// needed rather than relying on PrismaClient's own implicit detection.
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'MSWD' } });
  const fiscalYear = await prisma.fiscalYear.findFirstOrThrow({
    where: { organizationId: organization.id },
    orderBy: { year: 'desc' },
  });
  const adminUser = await prisma.user.findFirstOrThrow({
    where: { organizationId: organization.id, username: 'admin' },
  });

  // ── Sample departments (+ their organizational_units + matching
  // responsibility_centers — each department doubles as its own
  // responsibility center, a common simple setup for dev data) ──
  const departmentDefs = [
    { code: 'ADMIN-DIV', name: 'Administrative Division' },
    { code: 'FINANCE-DIV', name: 'Finance Division' },
    { code: 'ENGINEERING-DIV', name: 'Engineering Division' },
  ];

  const responsibilityCenters: Record<string, { id: string }> = {};

  for (const def of departmentDefs) {
    const unit = await prisma.organizationalUnit.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: def.code } },
      update: { name: def.name },
      create: {
        organizationId: organization.id,
        code: def.code,
        name: def.name,
        unitType: 'department',
      },
    });

    await prisma.department.upsert({
      where: { organizationalUnitId: unit.id },
      update: { name: def.name },
      create: {
        organizationId: organization.id,
        organizationalUnitId: unit.id,
        code: def.code,
        name: def.name,
      },
    });

    responsibilityCenters[def.code] = await prisma.responsibilityCenter.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: def.code } },
      update: { name: def.name },
      create: {
        organizationId: organization.id,
        organizationalUnitId: unit.id,
        code: def.code,
        name: def.name,
      },
    });
  }

  // ── Sample fund sources ──
  const fundSourceDefs = [
    { code: 'GF', name: 'General Fund' },
    { code: 'TF', name: 'Trust Fund' },
    { code: 'SEF', name: 'Special Education Fund' },
  ];
  const fundSources: Record<string, { id: string }> = {};
  for (const def of fundSourceDefs) {
    fundSources[def.code] = await prisma.fundSource.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: def.code } },
      update: { name: def.name },
      create: { organizationId: organization.id, code: def.code, name: def.name },
    });
  }

  // ── One budget cycle ──
  const budgetCycle = await prisma.budgetCycle.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: `FY${fiscalYear.year}-CYCLE` } },
    update: {},
    create: {
      organizationId: organization.id,
      fiscalYearId: fiscalYear.id,
      code: `FY${fiscalYear.year}-CYCLE`,
      name: `FY${fiscalYear.year} Budget Cycle`,
      status: 'active',
      createdBy: adminUser.id,
    },
  });

  // ── One version ──
  const budgetVersion = await prisma.budgetVersion.upsert({
    where: { budgetCycleId_versionNumber: { budgetCycleId: budgetCycle.id, versionNumber: 1 } },
    update: {},
    create: {
      budgetCycleId: budgetCycle.id,
      versionNumber: 1,
      name: 'Original',
      status: 'approved',
      isCurrent: true,
      createdBy: adminUser.id,
    },
  });

  // ── One approved budget (header) for Finance Division / General Fund ──
  const lineDefs = [
    { accountCode: '5-01-01-000', description: 'Personnel Services', amount: 500000 },
    { accountCode: '5-02-01-000', description: 'Maintenance and Other Operating Expenses (MOOE)', amount: 200000 },
    { accountCode: '5-03-01-000', description: 'Capital Outlay', amount: 100000 },
  ];
  const totalAmount = lineDefs.reduce((sum, l) => sum + l.amount, 0);

  const financeDivRc = responsibilityCenters['FINANCE-DIV'];
  const gfFund = fundSources['GF'];
  if (!financeDivRc) throw new Error('Seed error: FINANCE-DIV responsibility center was not created above.');
  if (!gfFund) throw new Error('Seed error: GF fund source was not created above.');

  const budgetHeader = await prisma.budgetHeader.upsert({
    where: {
      budgetVersionId_responsibilityCenterId_fundSourceId: {
        budgetVersionId: budgetVersion.id,
        responsibilityCenterId: financeDivRc.id,
        fundSourceId: gfFund.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      budgetVersionId: budgetVersion.id,
      responsibilityCenterId: financeDivRc.id,
      fundSourceId: gfFund.id,
      currencyCode: 'PHP',
      totalAmount,
      status: 'approved',
      createdBy: adminUser.id,
    },
  });

  // ── Sample budget lines ──
  for (const line of lineDefs) {
    const existing = await prisma.budgetLine.findFirst({
      where: { budgetHeaderId: budgetHeader.id, accountCode: line.accountCode },
    });
    if (!existing) {
      await prisma.budgetLine.create({
        data: {
          budgetHeaderId: budgetHeader.id,
          accountCode: line.accountCode,
          description: line.description,
          amount: line.amount,
          createdBy: adminUser.id,
        },
      });
    }
  }

  console.log('Budgeting dev seed complete:');
  console.log(`  Departments: ${departmentDefs.map((d) => d.code).join(', ')}`);
  console.log(`  Fund sources: ${fundSourceDefs.map((f) => f.code).join(', ')}`);
  console.log(`  Budget cycle: ${budgetCycle.name}`);
  console.log(`  Budget version: ${budgetVersion.name} (approved, current)`);
  console.log(`  Approved budget header: Finance Division / General Fund, total ${totalAmount}`);
  console.log(`  Budget lines: ${lineDefs.length}`);
}

main()
  .catch((err) => {
    console.error('Budgeting dev seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
