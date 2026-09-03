/**
 * Clear one organization's transactional accounting data — every Journal Entry
 * Voucher and Disbursement Voucher — while KEEPING the Chart of Accounts and the
 * opening-balance JEV. Use it to reset a freshly-migrated live system so the
 * accountant can re-enter the period's few transactions under the current rules.
 *
 * KEEPS   : chart_of_accounts (untouched), and any JEV whose source_table =
 *           'opening_balance' (the beginning-balances entry).
 * DELETES : every other JEV (manual + disbursement-sourced) with its lines
 *           (jev_lines cascade), and every disbursement voucher with its checks,
 *           deductions (cascade), notes and attachments.
 *
 * Modes (env MODE, default "inspect"):
 *   inspect  — read-only. Lists what is kept and what would be deleted. No writes.
 *   trial    — runs every delete inside a transaction, then ROLLS BACK. Proves the
 *              delete is FK-safe on the *real* data without changing anything.
 *   execute  — performs the deletion for real. Requires CONFIRM=DELETE as well.
 *
 * Scope: one organization. Set ORG_ID to pick one; otherwise the single
 * organization in the database is used (it errors if there is more than one).
 *
 *   npx tsx prisma/clear-transactions.ts                    # inspect
 *   MODE=trial   npx tsx prisma/clear-transactions.ts       # dry delete + rollback
 *   MODE=execute CONFIRM=DELETE npx tsx prisma/clear-transactions.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const NIL = '00000000-0000-0000-0000-000000000000';

const peso = (n: unknown): string =>
  `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date): string => d.toISOString().slice(0, 10);

async function resolveOrg(): Promise<{ id: string; name: string }> {
  const envId = process.env.ORG_ID?.trim();
  if (envId) {
    const org = await prisma.organization.findUnique({
      where: { id: envId },
      select: { id: true, name: true },
    });
    if (!org) throw new Error(`No organization with id ${envId}`);
    return org;
  }
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  if (orgs.length === 0) throw new Error('No organizations in the database.');
  if (orgs.length > 1)
    throw new Error(
      `Multiple organizations found — set ORG_ID to choose one:\n` +
        orgs.map((o) => `   ${o.name} = ${o.id}`).join('\n'),
    );
  return orgs[0];
}

async function main(): Promise<void> {
  const mode = (process.env.MODE ?? 'inspect').toLowerCase();
  const org = await resolveOrg();
  console.log(`Organization : ${org.name} (${org.id})`);
  console.log(`Mode         : ${mode.toUpperCase()}\n`);

  const keepJevs = await prisma.journalEntryVoucher.findMany({
    where: { organizationId: org.id, sourceTable: 'opening_balance' },
    select: {
      id: true,
      jevNumber: true,
      jevDate: true,
      totalDebit: true,
      status: true,
      particulars: true,
    },
  });
  const delJevs = await prisma.journalEntryVoucher.findMany({
    where: { organizationId: org.id, sourceTable: { not: 'opening_balance' } },
    select: {
      id: true,
      jevNumber: true,
      jevDate: true,
      sourceType: true,
      totalDebit: true,
      status: true,
      particulars: true,
    },
    orderBy: { jevDate: 'asc' },
  });
  const dvs = await prisma.disbursementVoucher.findMany({
    where: { organizationId: org.id },
    select: {
      id: true,
      dvNumber: true,
      dvDate: true,
      payeeName: true,
      netAmount: true,
      status: true,
    },
    orderBy: { dvDate: 'asc' },
  });

  console.log(`KEEP  — opening-balance JEV(s): ${keepJevs.length}`);
  for (const j of keepJevs)
    console.log(
      `   ✔ ${j.jevNumber}  ${day(j.jevDate)}  ${peso(j.totalDebit)}  [${j.status}]  ${j.particulars}`,
    );

  console.log(`\nDELETE — other JEVs: ${delJevs.length}`);
  for (const j of delJevs)
    console.log(
      `   ✗ ${j.jevNumber}  ${day(j.jevDate)}  ${j.sourceType}  ${peso(j.totalDebit)}  [${j.status}]  ${j.particulars.slice(0, 60)}`,
    );

  console.log(`\nDELETE — disbursement vouchers: ${dvs.length}`);
  for (const d of dvs)
    console.log(
      `   ✗ ${d.dvNumber}  ${day(d.dvDate)}  ${d.payeeName ?? ''}  ${peso(d.netAmount)}  [${d.status}]`,
    );

  if (keepJevs.length === 0) {
    console.log(
      `\n⚠  WARNING: no opening-balance JEV found (source_table='opening_balance').` +
        `\n   Nothing is marked KEEP — do NOT execute until you know the beginning balances are safe.`,
    );
  }

  if (mode === 'inspect') {
    console.log(
      `\nInspect only — nothing changed.` +
        `\nNext: MODE=trial (dry delete + rollback), then MODE=execute CONFIRM=DELETE to apply.`,
    );
    return;
  }
  if (mode === 'execute' && process.env.CONFIRM !== 'DELETE') {
    console.log(`\nRefusing to execute — set CONFIRM=DELETE to actually delete.`);
    return;
  }

  const jevIds = delJevs.map((j) => j.id);
  const dvIds = dvs.map((d) => d.id);

  const runDeletes = async (tx: Prisma.TransactionClient): Promise<void> => {
    // Checks are the only records that block a DV delete (onDelete: Restrict).
    // Remove each check's dependents first, then the checks themselves.
    const checks = await tx.check.findMany({
      where: { disbursementVoucherId: { in: dvIds.length ? dvIds : [NIL] } },
      select: { id: true },
    });
    const checkIds = checks.map((c) => c.id);
    if (checkIds.length) {
      const rec = await tx.bankReconciliationItem.deleteMany({
        where: { checkId: { in: checkIds } },
      });
      const hist = await tx.checkStatusHistory.deleteMany({ where: { checkId: { in: checkIds } } });
      const chk = await tx.check.deleteMany({ where: { id: { in: checkIds } } });
      console.log(`   checks ${chk.count}  (rec-items ${rec.count}, history ${hist.count})`);
    }
    // Polymorphic DV notes & attachments (no FK — matched by table + id).
    if (dvIds.length) {
      const cm = await tx.comment.deleteMany({
        where: {
          organizationId: org.id,
          commentableTable: 'disbursement_vouchers',
          commentableId: { in: dvIds },
        },
      });
      const at = await tx.attachment.deleteMany({
        where: {
          organizationId: org.id,
          attachableTable: 'disbursement_vouchers',
          attachableId: { in: dvIds },
        },
      });
      console.log(`   dv notes ${cm.count}, dv attachments ${at.count}`);
    }
    // JEVs — jev_lines cascade; depreciation-run/reversal links are set null.
    const jv = await tx.journalEntryVoucher.deleteMany({
      where: { id: { in: jevIds.length ? jevIds : [NIL] } },
    });
    console.log(`   JEVs ${jv.count}  (their lines cascade)`);
    // DVs — dv_deductions cascade.
    const dv = await tx.disbursementVoucher.deleteMany({
      where: { id: { in: dvIds.length ? dvIds : [NIL] } },
    });
    console.log(`   DVs ${dv.count}`);
  };

  if (mode === 'trial') {
    console.log(`\nTRIAL — running every delete in a transaction, then rolling back...`);
    const ROLLBACK = 'trial-rollback';
    try {
      await prisma.$transaction(
        async (tx) => {
          await runDeletes(tx);
          throw new Error(ROLLBACK);
        },
        { timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof Error && e.message === ROLLBACK) {
        console.log(
          `\n✔ TRIAL PASSED — all deletes succeeded and were rolled back. Nothing changed.`,
        );
        return;
      }
      console.error(`\n✗ TRIAL FAILED — a delete hit a constraint (rolled back, nothing changed).`);
      throw e;
    }
    return;
  }

  // execute
  console.log(`\nEXECUTE — deleting for real...`);
  await prisma.$transaction(async (tx) => runDeletes(tx), { timeout: 30000 });
  console.log(
    `\n✔ DONE. Chart of Accounts and the opening-balance JEV are preserved.` +
      `\n   Verify the Trial Balance still totals the opening balance before re-entering transactions.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
