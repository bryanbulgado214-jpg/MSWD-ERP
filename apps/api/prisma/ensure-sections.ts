import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// The four standard water-district sections. Each Department must be paired with
// an OrganizationalUnit (organizationalUnitId is unique), so we upsert both.
// Idempotent: safe to run repeatedly; it never touches other departments.
const SECTIONS = [
  { code: 'TSS', name: 'Technical Services Section' },
  { code: 'FSS', name: 'Finance Services Section' },
  { code: 'CSS', name: 'Commercial Services Section' },
  { code: 'ADM', name: 'Administrative Services Section' },
];

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  let created = 0;
  for (const org of orgs) {
    const rootUnit = await prisma.organizationalUnit.findFirst({
      where: { organizationId: org.id, parentUnitId: null },
      select: { id: true },
    });
    if (!rootUnit) {
      console.warn(`  org ${org.code}: no ROOT organizational unit — skipping.`);
      continue;
    }
    for (const s of SECTIONS) {
      const unit = await prisma.organizationalUnit.upsert({
        where: { organizationId_code: { organizationId: org.id, code: s.code } },
        update: { name: s.name },
        create: {
          organizationId: org.id,
          code: s.code,
          name: s.name,
          unitType: 'department',
          parentUnitId: rootUnit.id,
        },
      });
      const existing = await prisma.department.findUnique({
        where: { organizationalUnitId: unit.id },
        select: { id: true },
      });
      await prisma.department.upsert({
        where: { organizationalUnitId: unit.id },
        update: { name: s.name, code: s.code, isActive: true },
        create: {
          organizationId: org.id,
          organizationalUnitId: unit.id,
          code: s.code,
          name: s.name,
        },
      });
      if (!existing) created++;
    }
  }
  console.log(
    `Ensured ${SECTIONS.length} sections across ${orgs.length} org(s); ${created} department(s) created.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
