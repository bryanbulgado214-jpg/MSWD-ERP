import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Ensure a demo Teller user exists — a billing collector (TELLER role:
 * billing.read + billing.payment.collect + billing.reports) so they see only the
 * Collection / Other Collection screens, not the accounting internals. Password
 * matches the other demo users so the dev quick-login works. Idempotent: creates
 * the role, its permissions, and the user, or refreshes them.
 */
const TELLER_PERMISSIONS = ['billing.read', 'billing.payment.collect', 'billing.reports'];

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  const rootUnit = await prisma.organizationalUnit.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'asc' },
  });
  if (!rootUnit) throw new Error('No organizational unit found for SBWD.');

  // Teller role — a billing collector, scoped to the collection screens only.
  const role = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'TELLER' } },
    update: { isActive: true },
    create: {
      organizationId: org.id,
      code: 'TELLER',
      name: 'Teller',
      description: 'Collects payments and issues Official Receipts.',
      isActive: true,
    },
  });
  const perms = await prisma.permission.findMany({
    where: { code: { in: TELLER_PERMISSIONS } },
    select: { id: true, code: true },
  });
  if (perms.length < TELLER_PERMISSIONS.length) {
    const missing = TELLER_PERMISSIONS.filter((c) => !perms.some((p) => p.code === c));
    throw new Error(`Missing permissions: ${missing.join(', ')} — run the base seed first.`);
  }
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
      update: {},
      create: { roleId: role.id, permissionId: p.id },
    });
  }

  const passwordHash = await bcrypt.hash('ChangeMe!2026', 12);
  const user = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: org.id, username: 'sbwd.teller' } },
    update: { email: 'teller@sbwd.invalid', passwordHash, isActive: true },
    create: {
      organizationId: org.id,
      username: 'sbwd.teller',
      email: 'teller@sbwd.invalid',
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
  console.log('Ensured sbwd.teller (TELLER role) — quick-login ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
