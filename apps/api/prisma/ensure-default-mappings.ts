import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Default posting-account mappings for the disbursement (expenditure) cycle.
 * Keys match those resolved by AutoJevService; codes are the standard PH
 * water-district UACS accounts. Idempotent — safe to re-run. Extend this table
 * as more modules are integrated (payroll, inventory, etc.).
 */
const DEFAULT_MAPPINGS: Record<string, string> = {
  'cash.in_bank': '1-01-02-020-02', // Cash in Bank - LC, DBP Current Account
  'ap.accounts_payable': '2-01-01-010', // Accounts Payable
  'ap.due_to_bir': '2-02-01-010-02', // Due to BIR - Expanded Withholding Tax
};

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
  for (const org of orgs) {
    const actor = await prisma.user.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!actor) {
      console.log(`skip ${org.code}: no user to attribute the mapping to`);
      continue;
    }
    for (const [key, code] of Object.entries(DEFAULT_MAPPINGS)) {
      const acct = await prisma.chartOfAccount.findFirst({
        where: { organizationId: org.id, accountCode: code, isHeader: false, isActive: true },
        select: { id: true, name: true },
      });
      if (!acct) {
        console.log(`  ${org.code}: MISSING account ${code} for ${key} — left unmapped`);
        continue;
      }
      await prisma.accountMapping.upsert({
        where: { organizationId_mappingKey: { organizationId: org.id, mappingKey: key } },
        update: { chartOfAccountId: acct.id, updatedBy: actor.id },
        create: {
          organizationId: org.id,
          mappingKey: key,
          chartOfAccountId: acct.id,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });
      console.log(`  ${org.code}: ${key} -> ${code} (${acct.name})`);
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
