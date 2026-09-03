// gl.service.spec.ts — INTEGRATION TESTS.
//
// GlService.getTrialBalance runs raw SQL aggregations over posted JEV
// activity, so it genuinely needs a live PostgreSQL connection — there is
// no mock shortcut. We create our own posted JEVs (via JevService, with
// two distinct users to satisfy separation of duties) rather than relying
// on pre-seeded transaction data, which the MSWD org has almost none of.
// Point DATABASE_URL at a disposable test database — never dev/prod.

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';

import { AutoJevService } from './auto-jev.service';
import { GlService } from './gl.service';
import { JevService } from './jev.service';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);
const gl = new GlService(prisma as unknown as PrismaService, autoJev);
const jevService = new JevService(
  prisma as unknown as PrismaService,
  {
    notifyUsersWithPermission: async () => undefined,
  } as never,
);
const runId = Date.now().toString(36);

let organizationId: string;
let fiscalYearId: string;
let creatorId: string;
let posterId: string;
let debitAccountId: string;
let creditAccountId: string;

const jevDate = '2026-08-12';
const createdJevIds = new Set<string>();

// Throwaway second-org fixtures for the isolation test (cleaned in afterAll).
let otherOrgId: string | undefined;

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

  if (otherOrgId) {
    // Tear down the throwaway org bottom-up.
    await prisma.jevLine
      .deleteMany({ where: { jev: { organizationId: otherOrgId } } })
      .catch(() => {});
    await prisma.journalEntryVoucher
      .deleteMany({ where: { organizationId: otherOrgId } })
      .catch(() => {});
    await prisma.chartOfAccount
      .deleteMany({ where: { organizationId: otherOrgId } })
      .catch(() => {});
    await prisma.accountingPeriod
      .deleteMany({ where: { fiscalYear: { organizationId: otherOrgId } } })
      .catch(() => {});
    await prisma.fiscalYear.deleteMany({ where: { organizationId: otherOrgId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => {});
  }

  await prisma.$disconnect();
});

async function makePostedJev(amount: number) {
  const draft = await jevService.create(organizationId, creatorId, {
    jevDate,
    particulars: 'GL trial-balance fixture',
    lines: [
      { chartOfAccountId: debitAccountId, debitAmount: amount, creditAmount: 0 },
      { chartOfAccountId: creditAccountId, debitAmount: 0, creditAmount: amount },
    ],
  });
  createdJevIds.add(draft.id);
  const submitted = await jevService.submit(organizationId, draft.id, creatorId, draft.version);
  return jevService.post(organizationId, submitted.id, posterId, submitted.version);
}

describe('GlService.getTrialBalance', () => {
  it('balances: sum of every row totalDebit equals sum of every row totalCredit', async () => {
    await makePostedJev(1000);
    await makePostedJev(2500);

    const rows = await gl.getTrialBalance(organizationId, { fiscalYearId });
    expect(rows.length).toBeGreaterThan(0);

    const sumDebit = rows.reduce((s, r) => s + Number(r.totalDebit), 0);
    const sumCredit = rows.reduce((s, r) => s + Number(r.totalCredit), 0);
    expect(Math.abs(sumDebit - sumCredit)).toBeLessThan(0.01);

    // Our postings surfaced on the debit-normal account's debit side.
    const debitRow = rows.find((r) => r.accountId === debitAccountId);
    expect(debitRow).toBeDefined();
    expect(Number(debitRow!.totalDebit)).toBeGreaterThanOrEqual(3500);
  });

  it("never includes another organization's account activity (org isolation)", async () => {
    // Build a throwaway org with its own fiscal year, period, accounts and
    // a posted JEV (inserted directly — this org has no users/sequences).
    const otherOrg = await prisma.organization.create({
      data: { code: `TB-ISO-${runId}`.slice(0, 20), name: 'TB Isolation Org' },
    });
    otherOrgId = otherOrg.id;

    const otherFy = await prisma.fiscalYear.create({
      data: {
        organizationId: otherOrg.id,
        year: 2097,
        name: 'FY2097',
        startDate: new Date('2097-01-01'),
        endDate: new Date('2097-12-31'),
        status: 'open',
      },
    });
    const otherPeriod = await prisma.accountingPeriod.create({
      data: {
        fiscalYearId: otherFy.id,
        periodNumber: 1,
        name: 'January 2097',
        startDate: new Date('2097-01-01'),
        endDate: new Date('2097-01-31'),
        status: 'open',
      },
    });
    const oDebit = await prisma.chartOfAccount.create({
      data: {
        organizationId: otherOrg.id,
        accountCode: '10101010',
        name: 'Other Org Cash',
        accountType: 'asset',
        normalBalance: 'debit',
        level: 3,
        isHeader: false,
      },
    });
    const oCredit = await prisma.chartOfAccount.create({
      data: {
        organizationId: otherOrg.id,
        accountCode: '40201010',
        name: 'Other Org Revenue',
        accountType: 'revenue',
        normalBalance: 'credit',
        level: 3,
        isHeader: false,
      },
    });
    await prisma.journalEntryVoucher.create({
      data: {
        organizationId: otherOrg.id,
        jevNumber: 'JEV-2097-000001',
        jevDate: new Date('2097-01-15'),
        accountingPeriodId: otherPeriod.id,
        sourceType: 'manual',
        particulars: 'Other org activity — must not leak',
        totalDebit: 9999,
        totalCredit: 9999,
        status: 'posted',
        lines: {
          create: [
            { chartOfAccountId: oDebit.id, debitAmount: 9999, creditAmount: 0 },
            { chartOfAccountId: oCredit.id, debitAmount: 0, creditAmount: 9999 },
          ],
        },
      },
    });

    // MSWD's trial balance must not contain the other org's accounts.
    const mswdRows = await gl.getTrialBalance(organizationId, { fiscalYearId });
    const leaked = mswdRows.filter((r) => r.accountId === oDebit.id || r.accountId === oCredit.id);
    expect(leaked).toHaveLength(0);

    // The other org's own trial balance DOES see them (sanity check the
    // activity really exists and is scoped, not simply absent everywhere).
    const otherRows = await gl.getTrialBalance(otherOrg.id, { fiscalYearId: otherFy.id });
    const otherDebitRow = otherRows.find((r) => r.accountId === oDebit.id);
    expect(otherDebitRow).toBeDefined();
    expect(Number(otherDebitRow!.totalDebit)).toBe(9999);
  });
});
