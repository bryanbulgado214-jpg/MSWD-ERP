import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Permissions for the teller-session / remittance layer:
 *   - billing.session.manage       — teller opens/closes/remits their own shift.
 *   - collections.remittance.receive — cashier receives & verifies remittances.
 *
 * Idempotent: upserts each permission, then grants it to the listed roles in
 * every org that has them.
 */
const PERMISSIONS: Array<{ code: string; name: string; module: string; roles: string[] }> = [
  {
    code: 'billing.session.manage',
    name: 'Open / close / remit teller collection sessions',
    module: 'billing',
    roles: ['TELLER', 'ADMIN'],
  },
  {
    code: 'collections.remittance.receive',
    name: 'Receive & verify teller remittances',
    module: 'accounting',
    roles: ['CASHIER', 'ACCOUNTANT', 'ADMIN'],
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
    `Ensured ${PERMISSIONS.length} teller-session permissions; ${grants} role grants across ${orgs.length} org(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
