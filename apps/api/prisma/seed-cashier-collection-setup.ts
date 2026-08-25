import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Seeds the admin-managed collector and collection-area drop-down lists used by
 * the cashier's daily collection report. Collector names come from the sample
 * cashier's collection summary; the cashier's own name is flagged so it appears
 * in the same list. Idempotent (upsert on organization + name).
 */
const COLLECTORS: Array<{ name: string; isCashier?: boolean; sortOrder: number }> = [
  { name: 'Charissa G. Sumanoy', sortOrder: 1 },
  { name: 'Lila M. Pepio', sortOrder: 2 },
  { name: 'Rey B. Eslit', sortOrder: 3 },
  { name: 'Joel M. Oguis', sortOrder: 4 },
  { name: 'Jeramel B. Sumagang (Cashier)', isCashier: true, sortOrder: 5 },
];

const AREAS: Array<{ name: string; sortOrder: number }> = [
  { name: 'Poblacion', sortOrder: 1 },
  { name: 'Cang-isad', sortOrder: 2 },
  { name: 'Tominga', sortOrder: 3 },
  { name: 'Caipilan', sortOrder: 4 },
  { name: 'Larena Route', sortOrder: 5 },
];

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });

  for (const c of COLLECTORS) {
    const existing = await prisma.collector.findFirst({
      where: { organizationId: org.id, name: c.name },
      select: { id: true },
    });
    if (existing) {
      await prisma.collector.update({
        where: { id: existing.id },
        data: { isCashier: c.isCashier ?? false, isActive: true, sortOrder: c.sortOrder },
      });
    } else {
      await prisma.collector.create({
        data: {
          organizationId: org.id,
          name: c.name,
          isCashier: c.isCashier ?? false,
          isActive: true,
          sortOrder: c.sortOrder,
        },
      });
    }
  }

  for (const a of AREAS) {
    const existing = await prisma.collectionArea.findFirst({
      where: { organizationId: org.id, name: a.name },
      select: { id: true },
    });
    if (existing) {
      await prisma.collectionArea.update({
        where: { id: existing.id },
        data: { isActive: true, sortOrder: a.sortOrder },
      });
    } else {
      await prisma.collectionArea.create({
        data: { organizationId: org.id, name: a.name, isActive: true, sortOrder: a.sortOrder },
      });
    }
  }

  console.log(`Seeded ${COLLECTORS.length} collectors and ${AREAS.length} collection areas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
