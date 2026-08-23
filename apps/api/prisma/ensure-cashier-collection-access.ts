import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Gives the SBWD cashier (CASHIER role) the collection side of the house:
 *   - billing.read + billing.payment.collect — reach Billing & Collection and
 *     accept payments at the window.
 *   - collections.accounting.{view,review,approve,post} — run the cashier's
 *     collection reports and drive the maker-checker (consolidate → review →
 *     approve → post the daily collection JEV) and record deposits.
 *   - billing.reports.view — a NEW read-only permission that lets the cashier
 *     VIEW the teller's Billing Reports without holding the teller's own
 *     billing.reports ("run") permission. Reversal (collections.accounting.
 *     reverse) is deliberately NOT granted — it stays with ADMIN/ACCOUNTANT.
 *
 * Idempotent: upserts the new permission, then upserts each role grant.
 */

// The read-only view permission is new; everything else already exists from
// the base seed / Phase 9. Create the new one, then grant the full set.
const NEW_PERMISSION = {
  code: 'billing.reports.view',
  name: 'View billing (teller) reports — read only',
  module: 'billing',
};

const CASHIER_CODES = [
  'billing.read',
  'billing.payment.collect',
  'billing.reports.view',
  'collections.accounting.view',
  // The cashier finalizes (consolidates) the day's collections but does NOT do
  // the bookkeeping — review/approve/post/reverse stay with the accountant.
  'collections.accounting.consolidate',
];

// Segregation of duties: a cash custodian must not post to the GL. Revoke these
// from the cashier if an earlier build granted them.
const CASHIER_REVOKE = [
  'collections.accounting.review',
  'collections.accounting.approve',
  'collections.accounting.post',
  'collections.accounting.reverse',
];

async function main() {
  await prisma.permission.upsert({
    where: { code: NEW_PERMISSION.code },
    update: { name: NEW_PERMISSION.name },
    create: NEW_PERMISSION,
  });

  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });

  const perms = await prisma.permission.findMany({
    where: { code: { in: CASHIER_CODES } },
    select: { id: true, code: true },
  });
  const missing = CASHIER_CODES.filter((c) => !perms.some((p) => p.code === c));
  if (missing.length) {
    throw new Error(
      `Missing permissions: ${missing.join(', ')} — run the base seed + ensure-collection-permissions first.`,
    );
  }

  const role = await prisma.role.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: 'CASHIER' } },
    select: { id: true },
  });
  if (!role) {
    throw new Error('CASHIER role not found for SBWD — run the SBWD demo seed first.');
  }

  let grants = 0;
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
    grants++;
  }

  // Revoke any bookkeeping permissions a prior build gave the cashier.
  const revokePerms = await prisma.permission.findMany({
    where: { code: { in: CASHIER_REVOKE } },
    select: { id: true },
  });
  const revoked = await prisma.rolePermission.deleteMany({
    where: { roleId: role.id, permissionId: { in: revokePerms.map((p) => p.id) } },
  });

  console.log(
    `Cashier collection access ensured: granted ${grants} permission(s), revoked ${revoked.count} bookkeeping permission(s) from SBWD CASHIER.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
