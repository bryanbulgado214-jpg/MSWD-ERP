import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import { COLLECTION_TYPES } from '../src/modules/billing/collection-types';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Seeds the collection-type → GL account mappings the cashier's daily collection
 * report resolves against. Create-if-missing (never overwrites), so the
 * accountant's changes in Accounting → Account Mappings are preserved on re-run.
 */
async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  for (const org of orgs) {
    const actor = await prisma.user.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!actor) continue;
    for (const t of COLLECTION_TYPES) {
      const acct = await prisma.chartOfAccount.findFirst({
        where: {
          organizationId: org.id,
          accountCode: t.defaultGlCode,
          isHeader: false,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      if (!acct) {
        console.log(
          `  ${org.code}: MISSING ${t.defaultGlCode} for ${t.mappingKey} — left unmapped`,
        );
        continue;
      }
      await prisma.accountMapping.upsert({
        where: { organizationId_mappingKey: { organizationId: org.id, mappingKey: t.mappingKey } },
        update: {}, // keep the accountant's current choice if already set
        create: {
          organizationId: org.id,
          mappingKey: t.mappingKey,
          chartOfAccountId: acct.id,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });
      console.log(`  ${org.code}: ${t.mappingKey} -> ${t.defaultGlCode} (${acct.name})`);
    }
  }
}

main()
  .then(() => console.log('Done.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
