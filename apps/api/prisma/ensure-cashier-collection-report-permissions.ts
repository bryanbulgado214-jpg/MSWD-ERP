import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Permissions for the manual cashier daily collection report:
 *   - collections.cashier.report — the cashier keys/consolidates each teller's
 *     daily collectors' report and submits it (creating a draft JEV).
 *   - collections.setup.manage   — the admin maintains the collector and
 *     collection-area drop-down lists.
 *
 * Idempotent: upserts each permission, then grants it to the listed roles in
 * every org that has them.
 */
const PERMISSIONS: Array<{ code: string; name: string; module: string; roles: string[] }> = [
  {
    code: 'collections.cashier.report',
    name: "Prepare & submit the cashier's daily collection report",
    module: 'billing',
    roles: ['CASHIER', 'ADMIN'],
  },
  {
    code: 'collections.setup.manage',
    name: 'Manage collector & collection-area lists',
    module: 'admin',
    roles: ['ADMIN'],
  },
];

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  let grants = 0;
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { code: p.code, name: p.name, module: p.module },
    });
    for (const org of orgs) {
      const roles = await prisma.role.findMany({
        where: { organizationId: org.id, code: { in: p.roles } },
        select: { id: true },
      });
      for (const role of roles) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
        grants++;
      }
    }
  }
  console.log(
    `Ensured ${PERMISSIONS.length} cashier-collection-report permissions; ${grants} role grants across ${orgs.length} org(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
