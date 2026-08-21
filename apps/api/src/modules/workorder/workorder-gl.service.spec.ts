// workorder-gl.service.spec.ts — INTEGRATION TESTS (real PostgreSQL).
//
// Exercises the (now hardened) work-order → GL posting: on verify, Dr Repairs &
// Maintenance expense, Cr each consumed material's inventory account. Point
// DATABASE_URL at a disposable seeded database. Seeds a WO + material + item.

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);

const ITEM_CODE = 'TEST-WO-ITEM';
const WO_NUMBER = 'TEST-WO-1';
const COST = 800;

let organizationId: string;
let userId: string;
let repairsId: string;
let expendableInvId: string;
let workOrderId: string;

async function resolveMapping(mappingKey: string): Promise<string> {
  const m = await prisma.accountMapping.findFirstOrThrow({
    where: { organizationId, mappingKey, isActive: true },
    select: { chartOfAccountId: true },
  });
  return m.chartOfAccountId;
}

async function cleanupFixtures() {
  const wo = await prisma.workOrder.findFirst({
    where: { organizationId, woNumber: WO_NUMBER },
    select: { id: true },
  });
  if (wo) {
    const jevs = await prisma.journalEntryVoucher.findMany({
      where: { sourceTable: 'work_orders', sourceId: wo.id },
      select: { id: true },
    });
    const jevIds = jevs.map((j) => j.id);
    await prisma.jevLine.deleteMany({ where: { jevId: { in: jevIds } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevIds } } }).catch(() => {});
    await prisma.workOrderMaterial.deleteMany({ where: { workOrderId: wo.id } }).catch(() => {});
    await prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => {});
  }
  await prisma.inventoryItem
    .deleteMany({ where: { organizationId, itemCode: ITEM_CODE } })
    .catch(() => {});
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { organizationId } })).id;
  repairsId = await resolveMapping('expense.repairs_maintenance');
  expendableInvId = await resolveMapping('inventory.expendable');

  await cleanupFixtures();

  const item = await prisma.inventoryItem.create({
    data: {
      organizationId,
      itemCode: ITEM_CODE,
      description: 'Test WO material',
      unitOfMeasure: 'pc',
      classification: 'expendable',
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true },
  });
  const wo = await prisma.workOrder.create({
    data: {
      organizationId,
      woNumber: WO_NUMBER,
      type: 'repair',
      title: 'Test repair work order',
      status: 'completed',
      materialsCost: COST,
      createdBy: userId,
      updatedBy: userId,
      materials: {
        create: [{ inventoryItemId: item.id, quantityUsed: 4, unitCost: 200, totalCost: COST }],
      },
    },
    select: { id: true },
  });
  workOrderId = wo.id;
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('Work order → GL', () => {
  it('posts Dr Repairs & Maintenance, Cr the material inventory account', async () => {
    await runAudited(prisma, userId, (tx) =>
      autoJev.onWorkOrderVerified(tx, organizationId, userId, {
        id: workOrderId,
        woNumber: WO_NUMBER,
        verifiedAt: new Date('2026-08-12'),
      }),
    );

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'work_orders', sourceId: workOrderId },
      include: { lines: true },
    });
    expect(jev.status).toBe('posted');
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);
    expect(debit(repairsId)).toBeCloseTo(COST, 2);
    expect(credit(expendableInvId)).toBeCloseTo(COST, 2);
    const td = jev.lines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const tc = jev.lines.reduce((s, l) => s + Number(l.creditAmount), 0);
    expect(td).toBeCloseTo(tc, 2);
  });
});
