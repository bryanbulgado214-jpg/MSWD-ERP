import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import {
  COLLECTION_HOLDING_DEFAULT_GL,
  COLLECTION_HOLDING_MAPPING_KEY,
  COLLECTION_TYPES,
} from '../src/modules/billing/collection-types';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Seeds the collection-type → GL account mappings the cashier's daily collection
 * report resolves against. Create-if-missing (never overwrites), so the
 * accountant's changes in Accounting → Account Mappings are preserved on re-run.
 */
async function seedMapping(
  orgId: string,
  orgCode: string,
  actorId: string,
  mappingKey: string,
  glCode: string,
) {
  const acct = await prisma.chartOfAccount.findFirst({
    where: { organizationId: orgId, accountCode: glCode, isHeader: false, isActive: true },
    select: { id: true, name: true },
  });
  if (!acct) {
    console.log(`  ${orgCode}: MISSING ${glCode} for ${mappingKey} — left unmapped`);
    return;
  }
  await prisma.accountMapping.upsert({
    where: { organizationId_mappingKey: { organizationId: orgId, mappingKey } },
    update: {}, // keep the accountant's current choice if already set
    create: {
      organizationId: orgId,
      mappingKey,
      chartOfAccountId: acct.id,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });
  console.log(`  ${orgCode}: ${mappingKey} -> ${glCode} (${acct.name})`);
}

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  for (const org of orgs) {
    const actor = await prisma.user.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!actor) continue;
    // Standard collection types with a fixed GL. "Other" (mappingKey null) is
    // skipped — its GL is assigned per-entry by the accountant during review.
    for (const t of COLLECTION_TYPES) {
      if (!t.mappingKey || !t.defaultGlCode) continue;
      await seedMapping(org.id, org.code, actor.id, t.mappingKey, t.defaultGlCode);
    }
    // Holding/suspense account an unclassified "Other" collection credits until
    // the accountant reclassifies it on the journal entry.
    await seedMapping(
      org.id,
      org.code,
      actor.id,
      COLLECTION_HOLDING_MAPPING_KEY,
      COLLECTION_HOLDING_DEFAULT_GL,
    );
  }
}

main()
  .then(() => console.log('Done.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
