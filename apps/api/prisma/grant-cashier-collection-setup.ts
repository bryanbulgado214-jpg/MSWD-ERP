import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const prisma = new PrismaClient();

/**
 * Grant the CASHIER role the permission to maintain the teller & collection-
 * location lists (Reports → Collections → Tellers / Collection Location).
 * Idempotent — safe to run on an already-deployed tenant (live or demo).
 */
async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error('No organization found.');

  const perm = await prisma.permission.upsert({
    where: { code: 'collections.setup.manage' },
    update: {},
    create: {
      code: 'collections.setup.manage',
      name: 'Manage collector & collection-area lists',
      module: 'admin',
    },
  });

  const role = await prisma.role.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: 'CASHIER' } },
    select: { id: true },
  });
  if (!role) throw new Error('CASHIER role not found for this organization.');

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    update: {},
    create: { roleId: role.id, permissionId: perm.id },
  });

  console.log('Granted collections.setup.manage to the CASHIER role.');
}

main()
  .then(() => console.log('Done.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
