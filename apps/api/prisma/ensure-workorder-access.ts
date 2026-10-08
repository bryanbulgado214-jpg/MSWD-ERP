import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Safety-net for the live deploy: make sure every work-order permission ROW
// exists in the global `permissions` table, so the admin can list and assign
// them under Admin -> Roles (e.g. to the Technical / Commercial Services heads).
// Permissions-only and idempotent — this script creates NO roles and NO users
// (the live admin sets those up in the UI) and touches no data. Mirrors the
// workorder block of prisma/seed.ts.
const PERMISSIONS: Array<{ code: string; name: string; module: string }> = [
  { code: 'workorder.read', name: 'View Work Orders', module: 'workorder' },
  { code: 'workorder.create', name: 'Create Work Orders', module: 'workorder' },
  { code: 'workorder.assign', name: 'Assign Work Orders', module: 'workorder' },
  { code: 'workorder.assign.technical', name: 'Assign Crew (Technical)', module: 'workorder' },
  { code: 'workorder.assign.commercial', name: 'Assign Crew (Commercial)', module: 'workorder' },
  { code: 'workorder.team.manage', name: 'Manage Teams & Personnel', module: 'workorder' },
  { code: 'workorder.staff.manage', name: 'Manage Staff Availability', module: 'workorder' },
  { code: 'workorder.execute', name: 'Execute Work Orders', module: 'workorder' },
  { code: 'workorder.verify', name: 'Verify Completed Work', module: 'workorder' },
  { code: 'workorder.reports', name: 'View Work Order Reports', module: 'workorder' },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const p of PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { code: p.code } });
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: p,
    });
    if (existing) updated++;
    else created++;
  }
  console.log(
    `Work-order permission catalog ensured: ${PERMISSIONS.length} total ` +
      `(${created} created, ${updated} already present). No roles or users were changed.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
