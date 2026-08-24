/**
 * DEMO SEED — SBWD prior fiscal year (FY2025)
 * ------------------------------------------------------------------
 * A light, self-balancing prior year so the year-end statements' comparative
 * (Prior Year / 2025) columns and the SCE's opening balance populate instead of
 * showing blanks. Posts an opening-balance entry plus a few summary activity
 * vouchers; FY2025 net income is 700,000 and its year-end equity is 10,100,000
 * — matching the existing FY2026 opening equity, so the comparison is coherent.
 *
 * DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS. Idempotent: the FY2025
 * fiscal year / periods are upserted and its JEVs are wiped & rebuilt each run.
 *
 * Run:  npx ts-node prisma/seed-sbwd-fy2025.ts     (from apps/api)
 */
import * as path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_CODE = 'SBWD';
const YEAR = 2025;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Account code → [debit, credit] pairs per voucher. Every voucher balances.
type Entry = { code: string; debit?: number; credit?: number };

async function main() {
  const org = await prisma.organization.findUnique({ where: { code: ORG_CODE } });
  if (!org) throw new Error(`Organization ${ORG_CODE} not found. Run "npm run seed:demo" first.`);
  const orgId = org.id;

  const actor =
    (await prisma.user.findFirst({
      where: { username: 'demo.accountant' },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { userRoles: { some: { role: { organizationId: orgId } } } },
      select: { id: true },
    }));
  const actorId = actor?.id ?? null;

  // ── Fiscal year 2025 + 12 monthly periods (upsert) ─────────────────────
  let fy = await prisma.fiscalYear.findFirst({
    where: { organizationId: orgId, year: YEAR },
    select: { id: true },
  });
  if (!fy) {
    fy = await prisma.fiscalYear.create({
      data: {
        organizationId: orgId,
        year: YEAR,
        name: `FY${YEAR}`,
        startDate: d(`${YEAR}-01-01`),
        endDate: d(`${YEAR}-12-31`),
      },
      select: { id: true },
    });
  }
  const periodIds: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const start = d(`${YEAR}-${String(m).padStart(2, '0')}-01`);
    const end = d(
      `${YEAR}-${String(m).padStart(2, '0')}-${new Date(Date.UTC(YEAR, m, 0)).getUTCDate()}`,
    );
    let p = await prisma.accountingPeriod.findFirst({
      where: { fiscalYearId: fy.id, periodNumber: m },
      select: { id: true },
    });
    if (!p) {
      p = await prisma.accountingPeriod.create({
        data: {
          fiscalYearId: fy.id,
          periodNumber: m,
          name: `${MONTHS[m - 1]} ${YEAR}`,
          startDate: start,
          endDate: end,
        },
        select: { id: true },
      });
    }
    periodIds.push(p.id);
  }

  // ── Resolve postable accounts by code ──────────────────────────────────
  const codes = [
    '1-01-02-020-02',
    '1-01-01-010',
    '1-03-01-010',
    '1-04-04-120',
    '1-06-03-040',
    '1-06-05-020',
    '1-06-06-010',
    '1-06-03-041',
    '2-01-02-040-02',
    '3-01-01-020',
    '3-07-01-010',
    '4-02-02-160',
    '5-01-01-010',
    '5-02-09-010',
    '5-05-01-030',
  ];
  const accts = await prisma.chartOfAccount.findMany({
    where: { organizationId: orgId, accountCode: { in: codes } },
    select: { id: true, accountCode: true },
  });
  const idByCode = new Map(accts.map((a) => [a.accountCode, a.id]));
  for (const c of codes)
    if (!idByCode.has(c)) throw new Error(`COA account ${c} not found for ${ORG_CODE}.`);

  // ── Vouchers (all balanced, posted) ────────────────────────────────────
  const vouchers: { period: number; date: string; particulars: string; entries: Entry[] }[] = [
    {
      period: 1,
      date: `${YEAR}-01-01`,
      particulars: 'Opening balances as of January 1, 2025',
      entries: [
        { code: '1-01-02-020-02', debit: 1_900_000 },
        { code: '1-01-01-010', debit: 40_000 },
        { code: '1-03-01-010', debit: 1_400_000 },
        { code: '1-04-04-120', debit: 250_000 },
        { code: '1-06-03-040', debit: 8_500_000 },
        { code: '1-06-05-020', debit: 450_000 },
        { code: '1-06-06-010', debit: 1_100_000 },
        { code: '2-01-02-040-02', credit: 4_240_000 },
        { code: '3-01-01-020', credit: 8_000_000 },
        { code: '3-07-01-010', credit: 1_400_000 },
      ],
    },
    {
      period: 6,
      date: `${YEAR}-06-15`,
      particulars: 'Water sales revenue collected — CY 2025 (summary)',
      entries: [
        { code: '1-01-02-020-02', debit: 4_600_000 },
        { code: '4-02-02-160', credit: 4_600_000 },
      ],
    },
    {
      period: 6,
      date: `${YEAR}-06-30`,
      particulars: 'Salaries and wages paid — CY 2025 (summary)',
      entries: [
        { code: '5-01-01-010', debit: 1_650_000 },
        { code: '1-01-02-020-02', credit: 1_650_000 },
      ],
    },
    {
      period: 9,
      date: `${YEAR}-09-30`,
      particulars: 'Generation, transmission & distribution expenses — CY 2025 (summary)',
      entries: [
        { code: '5-02-09-010', debit: 1_450_000 },
        { code: '1-01-02-020-02', credit: 1_450_000 },
      ],
    },
    {
      period: 11,
      date: `${YEAR}-11-15`,
      particulars: 'Loan principal repayment — CY 2025',
      entries: [
        { code: '2-01-02-040-02', debit: 400_000 },
        { code: '1-01-02-020-02', credit: 400_000 },
      ],
    },
    {
      period: 12,
      date: `${YEAR}-12-31`,
      particulars: 'Depreciation — infrastructure assets, CY 2025',
      entries: [
        { code: '5-05-01-030', debit: 800_000 },
        { code: '1-06-03-041', credit: 800_000 },
      ],
    },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_user_id', ${actorId ?? ''}, true)`,
    );

    // Wipe & rebuild this FY's vouchers so re-runs are clean.
    await tx.jevLine.deleteMany({ where: { jev: { accountingPeriodId: { in: periodIds } } } });
    await tx.journalEntryVoucher.deleteMany({ where: { accountingPeriodId: { in: periodIds } } });

    let seq = 0;
    for (const v of vouchers) {
      seq += 1;
      const totalDebit = v.entries.reduce((s, e) => s + (e.debit ?? 0), 0);
      const totalCredit = v.entries.reduce((s, e) => s + (e.credit ?? 0), 0);
      if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
        throw new Error(
          `Voucher "${v.particulars}" is unbalanced (${totalDebit} vs ${totalCredit}).`,
        );
      }
      await tx.journalEntryVoucher.create({
        data: {
          organizationId: orgId,
          jevNumber: `JEV-${YEAR}-${String(seq).padStart(6, '0')}`,
          jevDate: d(v.date),
          accountingPeriodId: periodIds[v.period - 1]!,
          particulars: v.particulars,
          sourceType: 'manual',
          totalDebit,
          totalCredit,
          status: 'posted',
          createdBy: actorId,
          lines: {
            create: v.entries.map((e) => ({
              chartOfAccountId: idByCode.get(e.code)!,
              debitAmount: e.debit ?? 0,
              creditAmount: e.credit ?? 0,
            })),
          },
        },
      });
    }
  });

  console.log(`\nFY${YEAR} seeded for ${ORG_CODE}: ${vouchers.length} posted vouchers.`);
  console.log(
    '  Prior-year comparative columns (SFP/SCI/SCF) and the SCE opening balance will now populate.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
