import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

import { COLLECTION_TYPES } from '../src/modules/billing/collection-types';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const prisma = new PrismaClient();

/**
 * LIVE finalize — run AFTER `prisma migrate deploy`, `prisma generate`, and
 * `prisma db seed` on a fresh, empty database. Turns the base seed into a clean
 * live tenant for CASHIERING + ACCOUNTING only:
 *   - renames the organization to the live water district
 *   - grants the collection/cashiering permissions to ADMIN / ACCOUNTANT / CASHIER
 *   - ensures the three live logins (admin / accountant / cashier) and sets their password
 *   - deactivates every other (demo/test) login the base seed created
 *   - sets the collection → GL account mappings (so the cashier's report posts)
 *
 * It does NOT touch any demo database — it only acts on the database that
 * DATABASE_URL points at. It seeds NO transactions/balances: the accountant
 * uploads the Chart of Accounts adjustments and the Trial Balance in the app.
 *
 * Configure via environment variables (all optional):
 *   LIVE_ORG_NAME   display name           (default "Water District")
 *   LIVE_ORG_LEGAL  legal name             (default = LIVE_ORG_NAME)
 *   LIVE_ORG_CODE   short code             (default "WD")
 *   LIVE_PASSWORD   temp password for the  (default "ChangeMe!2026")
 *                   admin/accountant/cashier logins
 */
const CFG = {
  orgName: process.env.LIVE_ORG_NAME?.trim() || 'Water District',
  orgLegal: (process.env.LIVE_ORG_LEGAL || process.env.LIVE_ORG_NAME)?.trim() || 'Water District',
  orgCode: process.env.LIVE_ORG_CODE?.trim() || 'WD',
  password: process.env.LIVE_PASSWORD || 'ChangeMe!2026',
};

const LIVE_LOGINS = ['admin', 'accountant', 'cashier'];

// Collection/cashiering permissions (mirror the ensure-*.ts scripts) and the
// roles that hold each. Segregation of duties: the CASHIER consolidates but does
// NOT review/approve/post/reverse — that stays with ADMIN / ACCOUNTANT.
const PERMISSIONS: Array<{ code: string; name: string; module: string }> = [
  {
    code: 'collections.accounting.view',
    name: 'View collection batches & accounting',
    module: 'accounting',
  },
  {
    code: 'collections.accounting.consolidate',
    name: "Consolidate / finalize the day's collections",
    module: 'accounting',
  },
  {
    code: 'collections.accounting.review',
    name: 'Review collection batches',
    module: 'accounting',
  },
  {
    code: 'collections.accounting.approve',
    name: 'Approve collection batches',
    module: 'accounting',
  },
  {
    code: 'collections.accounting.post',
    name: 'Post collection batches & deposits to GL',
    module: 'accounting',
  },
  {
    code: 'collections.accounting.reverse',
    name: 'Reverse posted collection batches',
    module: 'accounting',
  },
  {
    code: 'collections.cashier.report',
    name: "Prepare & submit the cashier's daily collection report",
    module: 'billing',
  },
  {
    code: 'collections.setup.manage',
    name: 'Manage collector & collection-area lists',
    module: 'admin',
  },
  {
    code: 'billing.session.manage',
    name: 'Open / close / remit teller collection sessions',
    module: 'billing',
  },
  {
    code: 'collections.remittance.receive',
    name: 'Receive & verify teller remittances',
    module: 'accounting',
  },
  {
    code: 'billing.reports.view',
    name: 'View billing (teller) reports — read only',
    module: 'billing',
  },
];

const GRANTS: Record<string, string[]> = {
  ADMIN: [
    'collections.accounting.view',
    'collections.accounting.consolidate',
    'collections.accounting.review',
    'collections.accounting.approve',
    'collections.accounting.post',
    'collections.accounting.reverse',
    'collections.cashier.report',
    'collections.setup.manage',
    'billing.session.manage',
    'collections.remittance.receive',
  ],
  ACCOUNTANT: [
    'collections.accounting.view',
    'collections.accounting.consolidate',
    'collections.accounting.review',
    'collections.accounting.approve',
    'collections.accounting.post',
    'collections.accounting.reverse',
    'collections.remittance.receive',
  ],
  CASHIER: [
    'billing.read',
    'billing.payment.collect',
    'billing.reports.view',
    'collections.accounting.view',
    'collections.accounting.consolidate',
    'collections.cashier.report',
    'collections.remittance.receive',
    // The cashier maintains their own teller & collection-location lists
    // (Reports → Collections → Tellers / Collection Location).
    'collections.setup.manage',
  ],
};

// Extra GL account mappings the cashiering flow needs (by standard UACS code).
const EXTRA_MAPPINGS: Array<{ key: string; code: string }> = [
  { key: 'cash.collecting_officer', code: '1-01-01-010' },
];

async function main() {
  // 1) Organization (the base seed created exactly one).
  const org = await prisma.organization.findFirst({ select: { id: true, code: true } });
  if (!org) throw new Error('No organization found — run `prisma db seed` first.');
  const { id: orgId } = org;
  await prisma.organization.update({
    where: { id: orgId },
    data: { name: CFG.orgName, code: CFG.orgCode },
  });
  await prisma.organizationSettings.updateMany({
    where: { organizationId: orgId },
    data: { legalName: CFG.orgLegal },
  });
  const rootUnit = await prisma.organizationalUnit.findFirst({
    where: { organizationId: orgId, code: 'ROOT' },
    select: { id: true },
  });
  if (!rootUnit) throw new Error('ROOT organizational unit missing — did the base seed run?');
  const rootUnitId = rootUnit.id;

  // 1.5) Clear the base seed's generic chart of accounts + demo bank config so the
  //      accountant uploads THE chart of accounts (a clean slate). Safe on a fresh
  //      DB: there are no transactions referencing these yet. Order respects FKs.
  await prisma.accountMapping.deleteMany({ where: { organizationId: orgId } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: orgId } });
  await prisma.bank.deleteMany({ where: { organizationId: orgId } });
  const clearedCoa = await prisma.chartOfAccount.deleteMany({ where: { organizationId: orgId } });

  // 2) Permissions + role grants.
  const permByCode = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { code: p.code, name: p.name, module: p.module },
    });
    permByCode.set(p.code, perm.id);
  }
  // Base permissions referenced in GRANTS that already exist (billing.read, …).
  const referenced = Array.from(new Set(Object.values(GRANTS).flat()));
  const existing = await prisma.permission.findMany({
    where: { code: { in: referenced } },
    select: { id: true, code: true },
  });
  for (const e of existing) permByCode.set(e.code, e.id);

  let grantCount = 0;
  for (const [roleCode, codes] of Object.entries(GRANTS)) {
    const role = await prisma.role.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: roleCode } },
      select: { id: true },
    });
    if (!role) {
      console.log(`  (role ${roleCode} not found — skipping its grants)`);
      continue;
    }
    for (const code of codes) {
      const permId = permByCode.get(code);
      if (!permId) {
        console.log(`  (permission ${code} not found — skipped for ${roleCode})`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
        update: {},
        create: { roleId: role.id, permissionId: permId },
      });
      grantCount++;
    }
  }

  // 3) The three live logins. `accountant` already exists from the base seed;
  //    ensure `cashier` exists with the CASHIER role. Set all three passwords.
  const passwordHash = await bcrypt.hash(CFG.password, 12);
  async function ensureUser(username: string, roleCode: string, email: string) {
    const user = await prisma.user.upsert({
      where: { organizationId_username: { organizationId: orgId, username } },
      update: { passwordHash, isActive: true },
      create: { organizationId: orgId, username, email, passwordHash, isActive: true },
    });
    const role = await prisma.role.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: roleCode } },
      select: { id: true },
    });
    if (role) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId_organizationalUnitId: {
            userId: user.id,
            roleId: role.id,
            organizationalUnitId: rootUnitId,
          },
        },
        update: {},
        create: { userId: user.id, roleId: role.id, organizationalUnitId: rootUnitId },
      });
    }
    return user.id;
  }
  const adminId = await ensureUser('admin', 'ADMIN', 'admin@live.invalid');
  await ensureUser('accountant', 'ACCOUNTANT', 'accountant@live.invalid');
  await ensureUser('cashier', 'CASHIER', 'cashier@live.invalid');

  // 4) Deactivate every other (demo/test) login the base seed created.
  const deactivated = await prisma.user.updateMany({
    where: { organizationId: orgId, username: { notIn: LIVE_LOGINS } },
    data: { isActive: false },
  });

  // 5) Collection → GL account mappings (create-if-missing; keep any manual edits).
  let mapCount = 0;
  const wanted = [
    ...COLLECTION_TYPES.filter((t) => t.mappingKey && t.defaultGlCode).map((t) => ({
      key: t.mappingKey as string,
      code: t.defaultGlCode as string,
    })),
    ...EXTRA_MAPPINGS,
  ];
  for (const m of wanted) {
    const acct = await prisma.chartOfAccount.findFirst({
      where: { organizationId: orgId, accountCode: m.code, isHeader: false, isActive: true },
      select: { id: true },
    });
    if (!acct) {
      console.log(`  (COA ${m.code} not found — mapping ${m.key} left for the accountant to set)`);
      continue;
    }
    await prisma.accountMapping.upsert({
      where: { organizationId_mappingKey: { organizationId: orgId, mappingKey: m.key } },
      update: {},
      create: {
        organizationId: orgId,
        mappingKey: m.key,
        chartOfAccountId: acct.id,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    mapCount++;
  }

  console.log('\n=== LIVE bootstrap complete ===');
  console.log(`Organization : ${CFG.orgName} (code ${CFG.orgCode})`);
  console.log(
    `COA cleared  : ${clearedCoa.count} base accounts removed (accountant uploads their own)`,
  );
  console.log(`Permissions  : ${grantCount} collection/cashiering grants`);
  console.log(`Logins       : admin / accountant / cashier  (password: ${CFG.password})`);
  console.log(`Deactivated  : ${deactivated.count} other demo/test login(s)`);
  console.log(`GL mappings  : ${mapCount} set`);
  console.log('\nNext (in the app): the accountant uploads the Chart of Accounts + Trial Balance,');
  console.log('adds Bank Accounts, and confirms Account Mappings & Collection Setup.');
}

main()
  .then(() => console.log('Done.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
