import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import { COLLECTION_TYPES } from '../src/modules/billing/collection-types';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const prisma = new PrismaClient();

/**
 * Run this AFTER the accountant has uploaded the Chart of Accounts. It points
 * the cashiering GL mappings at the standard UACS account codes (create-if-
 * missing, so it never overwrites a choice the accountant already made in
 * Accounting → Account Mappings). Any code not present in the uploaded COA is
 * skipped and reported — the accountant sets that one manually in the UI.
 */
const MAPPINGS: Array<{ key: string; code: string }> = [
  ...COLLECTION_TYPES.filter((t) => t.mappingKey && t.defaultGlCode).map((t) => ({
    key: t.mappingKey as string,
    code: t.defaultGlCode as string,
  })),
  { key: 'cash.collecting_officer', code: '1-01-01-010' },
  { key: 'cash.in_bank', code: '1-01-02-020' },
];

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error('No organization found.');
  const actor = await prisma.user.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  let set = 0;
  for (const m of MAPPINGS) {
    const acct = await prisma.chartOfAccount.findFirst({
      where: { organizationId: org.id, accountCode: m.code, isHeader: false, isActive: true },
      select: { id: true, name: true },
    });
    if (!acct) {
      console.log(
        `  SKIP ${m.key} — ${m.code} not in the uploaded COA (set it in Account Mappings)`,
      );
      continue;
    }
    await prisma.accountMapping.upsert({
      where: { organizationId_mappingKey: { organizationId: org.id, mappingKey: m.key } },
      update: {},
      create: {
        organizationId: org.id,
        mappingKey: m.key,
        chartOfAccountId: acct.id,
        createdBy: actor?.id ?? null,
        updatedBy: actor?.id ?? null,
      },
    });
    console.log(`  ${m.key} -> ${m.code} (${acct.name})`);
    set++;
  }
  console.log(`\nSet ${set}/${MAPPINGS.length} GL mappings.`);
}

main()
  .then(() => console.log('Done.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
