// financial-statements.service.spec.ts — INTEGRATION TESTS.
//
// getFinancialStatements runs raw SQL over posted JEV activity and folds it
// into asset/liability/equity/revenue/expense/net-income totals, so it needs
// a live PostgreSQL connection. We post our own known, balanced entries and
// assert the statements tie back to the ledger. Point DATABASE_URL at a
// disposable test database — never dev/prod.

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';

import { FinancialStatementsService } from './financial-statements.service';
import { JevService } from './jev.service';

const prisma = new PrismaClient();
const fs = new FinancialStatementsService(prisma as unknown as PrismaService);
const jevService = new JevService(prisma as unknown as PrismaService);

let organizationId: string;
let fiscalYearId: string;
let creatorId: string;
let posterId: string;
let debitAccountId: string;
let creditAccountId: string;

const jevDate = '2026-08-12';
const createdJevIds = new Set<string>();

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;

  const fy = await prisma.fiscalYear.findFirstOrThrow({
    where: { organizationId, status: 'open' },
  });
  fiscalYearId = fy.id;

  const users = await prisma.user.findMany({
    where: { organizationId },
    take: 2,
    orderBy: { username: 'asc' },
  });
  if (users.length < 2) throw new Error('Seed must provide at least two users for the MSWD org.');
  creatorId = users[0]!.id;
  posterId = users[1]!.id;

  const debit = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      normalBalance: 'debit',
      accountType: 'asset',
    },
    orderBy: { accountCode: 'asc' },
  });
  const credit = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      normalBalance: 'credit',
      accountType: 'revenue',
    },
    orderBy: { accountCode: 'asc' },
  });
  debitAccountId = debit.id;
  creditAccountId = credit.id;
});

afterAll(async () => {
  const ids = [...createdJevIds];
  if (ids.length) {
    await prisma.jevLine.deleteMany({ where: { jevId: { in: ids } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

async function makePostedJev(amount: number) {
  const draft = await jevService.create(organizationId, creatorId, {
    jevDate,
    particulars: 'Financial-statements fixture',
    lines: [
      { chartOfAccountId: debitAccountId, debitAmount: amount, creditAmount: 0 },
      { chartOfAccountId: creditAccountId, debitAmount: 0, creditAmount: amount },
    ],
  });
  createdJevIds.add(draft.id);
  const submitted = await jevService.submit(organizationId, draft.id, creatorId, draft.version);
  return jevService.post(organizationId, submitted.id, posterId, submitted.version);
}

describe('FinancialStatementsService.getFinancialStatements', () => {
  it('ties to the GL: totalAssets == totalLiabilities + totalEquity + netIncome (extended accounting equation)', async () => {
    // Post known, balanced activity (debit an asset, credit revenue).
    await makePostedJev(1500);
    await makePostedJev(2000);

    const stmt = await fs.getFinancialStatements(organizationId, { fiscalYearId });

    const assets = Number(stmt.totalAssets);
    const liabilities = Number(stmt.totalLiabilities);
    const equity = Number(stmt.totalEquity);
    const revenue = Number(stmt.totalRevenue);
    const expenses = Number(stmt.totalExpenses);
    const netIncome = Number(stmt.netIncome);

    // netIncome is derived as revenue - expenses.
    expect(Math.abs(netIncome - (revenue - expenses))).toBeLessThan(0.01);

    // Extended accounting equation must hold (before period close, net
    // income sits outside equity): A = L + E + (R - E_xp).
    expect(Math.abs(assets - (liabilities + equity + netIncome))).toBeLessThan(0.01);

    // The revenue we posted is actually reflected.
    expect(revenue).toBeGreaterThanOrEqual(3500);
  });
});
