import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

type Nature = 'receivable_settlement' | 'income' | 'liability';

// Default collection components and the GL account each posts to (resolved by
// account code). receivable_settlement credits A/R (already recognized at
// billing); income / liability recognize a new income or liability when
// collected. Fees and deposits do not require a consumer — a walk-in applicant
// can pay them before an account exists.
const DEFAULTS: Array<{
  code: string;
  name: string;
  nature: Nature;
  accountCode: string | null;
  requiresConsumer: boolean;
  isSystem: boolean;
  sortOrder: number;
}> = [
  {
    code: 'WATER_BILL',
    name: 'Water Bill Payment',
    nature: 'receivable_settlement',
    accountCode: '1-03-01-010',
    requiresConsumer: true,
    isSystem: true,
    sortOrder: 1,
  },
  {
    code: 'PENALTY',
    name: 'Late Payment Penalty',
    nature: 'receivable_settlement',
    accountCode: '1-03-01-010',
    requiresConsumer: true,
    isSystem: true,
    sortOrder: 2,
  },
  {
    code: 'REGISTRATION_FEE',
    name: 'Registration / Membership Fee',
    nature: 'income',
    accountCode: '4-02-02-990-01',
    requiresConsumer: false,
    isSystem: false,
    sortOrder: 3,
  },
  {
    code: 'INSTALLATION_FEE',
    name: 'Installation Fee',
    nature: 'income',
    accountCode: '4-02-02-990-01',
    requiresConsumer: false,
    isSystem: false,
    sortOrder: 4,
  },
  {
    code: 'RECONNECTION_FEE',
    name: 'Reconnection Fee',
    nature: 'income',
    accountCode: '4-02-02-990-01',
    requiresConsumer: false,
    isSystem: false,
    sortOrder: 5,
  },
  {
    code: 'RELOCATION_FEE',
    name: 'Relocation Fee',
    nature: 'income',
    accountCode: '4-02-02-990-01',
    requiresConsumer: false,
    isSystem: false,
    sortOrder: 6,
  },
  {
    code: 'GUARANTY_DEPOSIT',
    name: 'Guaranty / Meter Deposit',
    nature: 'liability',
    accountCode: '2-04-01-040',
    requiresConsumer: false,
    isSystem: false,
    sortOrder: 7,
  },
  {
    code: 'ADVANCE_PAYMENT',
    name: 'Advance / Customer Deposit',
    nature: 'liability',
    accountCode: '2-04-01-050',
    requiresConsumer: false,
    isSystem: false,
    sortOrder: 8,
  },
];

/**
 * Idempotently ensure the default collection-type catalog exists for an
 * organization. Creates missing types; for an existing type it only backfills a
 * still-empty GL account — it never overwrites an accountant's configuration.
 */
export async function ensureCollectionTypes(
  prisma: PrismaClient,
  organizationId: string,
  userId?: string,
) {
  let created = 0;
  for (const d of DEFAULTS) {
    const account = d.accountCode
      ? await prisma.chartOfAccount.findFirst({
          where: { organizationId, accountCode: d.accountCode, isActive: true },
          select: { id: true },
        })
      : null;
    const existing = await prisma.collectionType.findUnique({
      where: { organizationId_code: { organizationId, code: d.code } },
    });
    if (existing) {
      if (!existing.glAccountId && account) {
        await prisma.collectionType.update({
          where: { id: existing.id },
          data: { glAccountId: account.id, ...(userId ? { updatedBy: userId } : {}) },
        });
      }
      continue;
    }
    await prisma.collectionType.create({
      data: {
        organizationId,
        code: d.code,
        name: d.name,
        nature: d.nature,
        glAccountId: account?.id ?? null,
        requiresConsumer: d.requiresConsumer,
        isSystem: d.isSystem,
        isActive: true,
        sortOrder: d.sortOrder,
        ...(userId ? { createdBy: userId, updatedBy: userId } : {}),
      },
    });
    created++;
  }
  return { created };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  (async () => {
    const orgs = await prisma.organization.findMany({ select: { id: true, code: true } });
    for (const o of orgs) {
      const { created } = await ensureCollectionTypes(prisma, o.id);
      console.log(`Collection types ensured for ${o.code} (${created} created).`);
    }
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
