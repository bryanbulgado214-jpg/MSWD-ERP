import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Full inventory catalog (matches the controllers) + the new month-end GL and
// Supplies Ledger Card codes. Upserted globally (idempotent).
const PERMISSIONS: Array<{ code: string; name: string; module: string }> = [
  { code: 'inventory.read', name: 'View Inventory Data', module: 'inventory' },
  { code: 'inventory.reports', name: 'Inventory Reports', module: 'inventory' },
  { code: 'inventory.item.manage', name: 'Manage Inventory Items', module: 'inventory' },
  { code: 'inventory.receipt.manage', name: 'Record Stock Receipts', module: 'inventory' },
  { code: 'inventory.ris.manage', name: 'Create/Manage RIS', module: 'inventory' },
  { code: 'inventory.ris.approve', name: 'Approve RIS', module: 'inventory' },
  { code: 'inventory.ris.issue', name: 'Issue Stock via RIS', module: 'inventory' },
  { code: 'inventory.property.manage', name: 'Manage Property Records', module: 'inventory' },
  {
    code: 'inventory.accountability.manage',
    name: 'Manage PAR/ICS Accountability',
    module: 'inventory',
  },
  { code: 'inventory.physical_count.manage', name: 'Manage Physical Counts', module: 'inventory' },
  {
    code: 'inventory.physical_count.approve',
    name: 'Approve Physical Counts',
    module: 'inventory',
  },
  { code: 'inventory.dispose.manage', name: 'Manage Disposal/WMR', module: 'inventory' },
  { code: 'inventory.dispose.appraise', name: 'Appraise Disposal/WMR', module: 'inventory' },
  { code: 'inventory.dispose.approve', name: 'Approve Disposal/WMR', module: 'inventory' },
  { code: 'inventory.gl.post', name: 'Post Month-End Inventory JEV', module: 'inventory' },
  {
    code: 'accounting.supply_ledger.read',
    name: 'View Supplies Ledger Card',
    module: 'accounting',
  },
  {
    code: 'accounting.supply_ledger.manage',
    name: 'Maintain Supplies Ledger Card',
    module: 'accounting',
  },
];

// Warehouseman = physical custody (receive + create/issue RIS).
const WAREHOUSEMAN_PERMS = [
  'inventory.read',
  'inventory.receipt.manage',
  'inventory.ris.manage',
  'inventory.ris.issue',
];
// Stock-card personnel = records + valuation + month-end JEV (and the
// property/count/disposal records, since these two users cover the module).
const STOCK_CARD_PERMS = [
  'inventory.read',
  'inventory.reports',
  'inventory.item.manage',
  'inventory.ris.approve',
  'inventory.property.manage',
  'inventory.accountability.manage',
  'inventory.physical_count.manage',
  'inventory.physical_count.approve',
  'inventory.dispose.manage',
  'inventory.dispose.appraise',
  'inventory.dispose.approve',
  'inventory.gl.post',
];
// Accountant maintains the Supplies Ledger Card.
const ACCOUNTANT_EXTRA = ['accounting.supply_ledger.read', 'accounting.supply_ledger.manage'];

const ROLES = [
  {
    code: 'WAREHOUSEMAN',
    name: 'Warehouseman',
    description: 'Physical stock custody — records receipts and issues supplies via RIS.',
    perms: WAREHOUSEMAN_PERMS,
    user: { username: 'warehouseman', email: 'warehouseman@live.invalid' },
  },
  {
    code: 'STOCK_CARD_PERSONNEL',
    name: 'Stock Card Personnel',
    description:
      'Maintains stock cards & valuation, approves RIS, and triggers the month-end inventory JEV.',
    perms: STOCK_CARD_PERMS,
    user: { username: 'stockcards', email: 'stockcards@live.invalid' },
  },
];

async function main() {
  const password = process.env.LIVE_PASSWORD ?? 'ChangeMe!2026';
  const passwordHash = await bcrypt.hash(password, 12);

  // 1) Catalog.
  const permId = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: p,
    });
    permId.set(p.code, perm.id);
  }

  // Inventory document-number sequences (idempotent) — an org created after the
  // inventory migration ran won't have these, and receipts/RIS need them.
  await prisma.$executeRawUnsafe(`
    INSERT INTO document_sequences (id, organization_id, document_type, prefix, next_number, padding)
    SELECT gen_random_uuid(), o.id, dt.type, dt.prefix, 1, 6
    FROM organizations o
    CROSS JOIN (VALUES
      ('stock_receipt', 'SR-'),
      ('ris', 'RIS-'),
      ('par', 'PAR-'),
      ('ics', 'ICS-'),
      ('physical_count', 'PC-'),
      ('disposal_request', 'WMR-'),
      ('property_record', 'PROP-')
    ) AS dt(type, prefix)
    ON CONFLICT DO NOTHING
  `);

  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  let roleCount = 0;
  let userCount = 0;

  for (const org of orgs) {
    const rootUnit = await prisma.organizationalUnit.findFirst({
      where: { organizationId: org.id, code: 'ROOT' },
      select: { id: true },
    });
    if (!rootUnit) {
      console.warn(`  org ${org.code}: no ROOT unit — skipping user creation.`);
    }

    // 2) The two roles + their grants + login.
    for (const r of ROLES) {
      const role = await prisma.role.upsert({
        where: { organizationId_code: { organizationId: org.id, code: r.code } },
        update: { name: r.name, description: r.description, isActive: true },
        create: {
          organizationId: org.id,
          code: r.code,
          name: r.name,
          description: r.description,
          isSystemRole: true,
        },
      });
      roleCount++;
      for (const code of r.perms) {
        const pid = permId.get(code);
        if (!pid) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: pid } },
          update: {},
          create: { roleId: role.id, permissionId: pid },
        });
      }

      if (rootUnit) {
        const user = await prisma.user.upsert({
          where: { organizationId_username: { organizationId: org.id, username: r.user.username } },
          update: { passwordHash, isActive: true },
          create: {
            organizationId: org.id,
            username: r.user.username,
            email: r.user.email,
            passwordHash,
            isActive: true,
          },
        });
        await prisma.userRole.upsert({
          where: {
            userId_roleId_organizationalUnitId: {
              userId: user.id,
              roleId: role.id,
              organizationalUnitId: rootUnit.id,
            },
          },
          update: {},
          create: { userId: user.id, roleId: role.id, organizationalUnitId: rootUnit.id },
        });
        userCount++;
      }
    }

    // 3) Supplies Ledger Card for the accountant.
    const accountant = await prisma.role.findUnique({
      where: { organizationId_code: { organizationId: org.id, code: 'ACCOUNTANT' } },
      select: { id: true },
    });
    if (accountant) {
      for (const code of ACCOUNTANT_EXTRA) {
        const pid = permId.get(code);
        if (!pid) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: accountant.id, permissionId: pid } },
          update: {},
          create: { roleId: accountant.id, permissionId: pid },
        });
      }
    }
  }

  console.log(
    `Ensured ${PERMISSIONS.length} permissions; ${roleCount} roles and ${userCount} users across ${orgs.length} org(s). Password: ${password}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
