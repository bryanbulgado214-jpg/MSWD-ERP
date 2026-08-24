import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Seeds a beginning cash balance for the DBP Current Account (Operating) so the
 * account does not go negative once the sample disbursements are posted.
 *
 * Balances are scoped per fiscal year in this system (each fiscal year carries
 * its OWN opening entry — the GL/SFP never sums cash across years). So the
 * December 31, 2025 ending balance is mirrored as the January 1, 2026 beginning
 * balance: two posted opening-balance vouchers, one in each fiscal year,
 * Dr Cash in Bank (DBP Operating) / Cr Accumulated Surplus.
 *
 * Idempotent: clears the opening-balance JEVs it previously posted for this
 * account (matched by a marker in the particulars), then re-creates them.
 */

const CASH_CODE = '1-01-02-020-02'; // Cash in Bank - Local Currency - DBP Current Account
const EQUITY_CODE = '3-01-01-010'; // Accumulated Surplus / (Deficit)
const AMOUNT = 3_500_000;
const MARKER = '[DBP-OPERATING-OPENING]';

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  const admin = await prisma.user.findFirstOrThrow({
    where: { organizationId: org.id, username: 'demo.admin' },
    select: { id: true },
  });

  const cash = await prisma.chartOfAccount.findFirst({
    where: { organizationId: org.id, accountCode: CASH_CODE },
    select: { id: true, name: true },
  });
  const equity = await prisma.chartOfAccount.findFirst({
    where: { organizationId: org.id, accountCode: EQUITY_CODE },
    select: { id: true, name: true },
  });
  if (!cash || !equity)
    throw new Error('Cash or equity account not found in the chart of accounts.');

  const periodForDate = (date: Date) =>
    prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId: org.id },
        status: 'open',
        lockedAt: null,
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: { id: true, name: true },
    });

  const nextJevNumber = async (year: number): Promise<string> => {
    const rows = await prisma.$queryRaw<Array<{ next_number: bigint }>>`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = NOW()
      WHERE organization_id = ${org.id}::uuid AND document_type = 'jev'
      RETURNING next_number`;
    if (rows[0]) return `JEV-${year}-${String(rows[0].next_number).padStart(6, '0')}`;
    const ins = await prisma.$queryRaw<Array<{ next_number: bigint }>>`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${org.id}::uuid, 'jev', 'JEV-', 1)
      RETURNING next_number`;
    return `JEV-${year}-${String(ins[0]!.next_number).padStart(6, '0')}`;
  };

  // Reset any opening-balance vouchers this seed had posted for the account.
  await prisma.journalEntryVoucher.deleteMany({
    where: {
      organizationId: org.id,
      sourceTable: 'opening_balance',
      particulars: { contains: MARKER },
    },
  });

  const entries: Array<{ date: Date; label: string }> = [
    { date: new Date(Date.UTC(2025, 11, 31)), label: 'Beginning balance as of December 31, 2025' },
    {
      date: new Date(Date.UTC(2026, 0, 1)),
      label: 'Beginning balance for FY2026 (carried forward from December 31, 2025)',
    },
  ];

  let created = 0;
  for (const e of entries) {
    const period = await periodForDate(e.date);
    if (!period) {
      console.warn(`  Skipped ${e.date.toISOString().slice(0, 10)} — no open period covers it.`);
      continue;
    }
    await prisma.journalEntryVoucher.create({
      data: {
        organizationId: org.id,
        jevNumber: await nextJevNumber(e.date.getUTCFullYear()),
        jevDate: e.date,
        accountingPeriodId: period.id,
        sourceType: 'manual' as never,
        sourceTable: 'opening_balance',
        particulars: `${e.label} — Cash in Bank, DBP Current Account (Operating). ${MARKER}`,
        totalDebit: AMOUNT,
        totalCredit: AMOUNT,
        status: 'posted' as never,
        postedBy: admin.id,
        postedAt: e.date,
        createdBy: admin.id,
        updatedBy: admin.id,
        createdAt: e.date,
        lines: {
          create: [
            {
              chartOfAccountId: cash.id,
              debitAmount: AMOUNT,
              creditAmount: 0,
              description: 'Beginning balance — Cash in Bank, DBP Operating',
            },
            {
              chartOfAccountId: equity.id,
              debitAmount: 0,
              creditAmount: AMOUNT,
              description: 'Beginning balance — Accumulated Surplus / (Deficit)',
            },
          ],
        },
      },
    });
    created += 1;
    console.log(`  Posted ${e.label} (${period.name}) — ₱${AMOUNT.toLocaleString()}.`);
  }

  console.log(
    `Seeded ${created} opening-balance voucher(s) for ${cash.name}: Dr Cash / Cr ${equity.name}, ₱${AMOUNT.toLocaleString()} each.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
