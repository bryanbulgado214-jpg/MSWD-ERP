import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Safety-net for the live deploy: make sure every procurement permission ROW
// exists in the global `permissions` table, so the admin can list and assign
// them under Admin -> Roles. Permissions-only and idempotent by design — this
// script creates NO roles and NO users (the live admin sets those up in the UI)
// and touches no data. It mirrors the procurement block of prisma/seed.ts, which
// has shipped since the initial commit; on a live DB seeded from it these are
// upserted no-ops, but running it costs nothing and guarantees the catalog.
const PERMISSIONS: Array<{ code: string; name: string; module: string }> = [
  { code: 'procurement.read', name: 'View Procurement Data', module: 'procurement' },
  { code: 'procurement.pr.create', name: 'Create Purchase Requests', module: 'procurement' },
  { code: 'procurement.pr.edit', name: 'Edit Draft Purchase Requests', module: 'procurement' },
  { code: 'procurement.pr.submit', name: 'Submit Purchase Requests', module: 'procurement' },
  { code: 'procurement.pr.approve', name: 'Approve Purchase Requests (legacy)', module: 'procurement' },
  { code: 'procurement.pr.reject', name: 'Reject Purchase Requests (legacy)', module: 'procurement' },
  { code: 'procurement.pr.cancel', name: 'Cancel Purchase Requests', module: 'procurement' },
  { code: 'procurement.pr.endorse', name: 'Endorse Purchase Requests (Dept Head)', module: 'procurement' },
  { code: 'procurement.pr.budget_certify', name: 'Certify Budget Availability', module: 'procurement' },
  { code: 'procurement.pr.final_approve', name: 'Final PR Approval (GM/HoPE)', module: 'procurement' },
  { code: 'procurement.pr.accept_procurement', name: 'Accept PR for Procurement', module: 'procurement' },
  { code: 'procurement.pr.return_to_user', name: 'Return PR to End-User', module: 'procurement' },
  { code: 'procurement.pr.mark_lifecycle', name: 'Advance PR Lifecycle Status', module: 'procurement' },
  { code: 'procurement.pr.view_all', name: 'View All PRs Across Departments', module: 'procurement' },
  { code: 'procurement.pr.inspect', name: 'Record Inspection & Acceptance', module: 'procurement' },
  { code: 'procurement.ppmp.manage', name: 'Manage PPMP Items', module: 'procurement' },
  { code: 'procurement.app.manage', name: 'Manage APP Items', module: 'procurement' },
  { code: 'procurement.bac.view', name: 'View BAC Procurement Data', module: 'procurement' },
  { code: 'procurement.delegation.manage', name: 'Manage Delegation Authorities', module: 'procurement' },
  { code: 'procurement.supplier.manage', name: 'Manage Suppliers', module: 'procurement' },
  { code: 'procurement.po.create', name: 'Create Purchase Orders', module: 'procurement' },
  { code: 'procurement.po.approve', name: 'Approve Purchase Orders', module: 'procurement' },
  { code: 'procurement.caf.create', name: 'Create CAF', module: 'procurement' },
  { code: 'procurement.caf.certify', name: 'Certify CAF (Accounting Official)', module: 'procurement' },
  { code: 'procurement.caf.cancel', name: 'Cancel or Supersede CAF', module: 'procurement' },
  { code: 'procurement.ors.create', name: 'Create ORS', module: 'procurement' },
  { code: 'procurement.ors.requesting_certify', name: 'Certify ORS (Requesting Office)', module: 'procurement' },
  { code: 'procurement.ors.budget_certify', name: 'Certify ORS Budget & Post Obligation', module: 'procurement' },
  { code: 'procurement.ors.adjust', name: 'Adjust or De-obligate ORS', module: 'procurement' },
  { code: 'procurement.ors.cancel', name: 'Cancel ORS', module: 'procurement' },
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
    `Procurement permission catalog ensured: ${PERMISSIONS.length} total ` +
      `(${created} created, ${updated} already present). No roles or users were changed.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
