import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Maker-checker permissions for the collection-accounting workflow.
const PERMISSIONS: Array<{ code: string; name: string }> = [
  { code: 'collections.accounting.view', name: 'View collection batches & accounting' },
  { code: 'collections.accounting.review', name: 'Review / consolidate collection batches' },
  { code: 'collections.accounting.approve', name: 'Approve collection batches' },
  { code: 'collections.accounting.post', name: 'Post collection batches & deposits to GL' },
  { code: 'collections.accounting.reverse', name: 'Reverse posted collection batches' },
];
// Which existing roles receive them (all five each). Segregation of duties is
// enforced per-action at post time, not by withholding the permission.
const ROLES_WITH_ALL = ['ADMIN', 'ACCOUNTANT'];

async function main() {
  const perms = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { code: p.code, name: p.name, module: 'accounting' },
    });
    perms.set(p.code, perm.id);
  }

  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  let grants = 0;
  for (const org of orgs) {
    const roles = await prisma.role.findMany({
      where: { organizationId: org.id, code: { in: ROLES_WITH_ALL } },
      select: { id: true },
    });
    for (const role of roles) {
      for (const permId of perms.values()) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          update: {},
          create: { roleId: role.id, permissionId: permId },
        });
        grants++;
      }
    }
  }
  console.log(
    `Ensured ${PERMISSIONS.length} collection-accounting permissions; ${grants} role grants across ${orgs.length} org(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
