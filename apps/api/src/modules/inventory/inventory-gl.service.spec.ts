// inventory-gl.service.spec.ts — INTEGRATION TESTS (real PostgreSQL).
//
// Exercises the refined inventory → GL posting:
//  1. Stock receipt groups each item's cost under its resolved account — an
//     item's own accountCode when set, else a classification default — with A/P.
//  2. RIS issuance posts Dr supplies expense, Cr the item's inventory account.
//
// Point DATABASE_URL at a disposable seeded database. Drives the auto-JEV
// handlers through runAudited (which sets the audit actor + transaction).

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);

// A real postable PPE account used to exercise the item-level accountCode override.
const OVERRIDE_PPE_CODE = '1-06-05-020'; // Office Equipment

let organizationId: string;
let userId: string;
let apId: string;
let expendableInvId: string;
let expenseId: string;
let overridePpeId: string;

const createdSourceIds = new Set<string>();

async function resolveMapping(mappingKey: string): Promise<string> {
  const m = await prisma.accountMapping.findFirstOrThrow({
    where: { organizationId, mappingKey, isActive: true },
    select: { chartOfAccountId: true },
  });
  return m.chartOfAccountId;
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { organizationId } })).id;

  apId = await resolveMapping('ap.accounts_payable');
  expendableInvId = await resolveMapping('inventory.expendable');
  expenseId = await resolveMapping('expense.expendable');
  overridePpeId = (
    await prisma.chartOfAccount.findFirstOrThrow({
      where: { organizationId, accountCode: OVERRIDE_PPE_CODE, isHeader: false },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  const ids = [...createdSourceIds];
  if (ids.length) {
    const jevs = await prisma.journalEntryVoucher.findMany({
      where: {
        sourceId: { in: ids },
        sourceTable: { in: ['stock_receipts', 'requisition_issue_slips'] },
      },
      select: { id: true },
    });
    const jevIds = jevs.map((j) => j.id);
    await prisma.jevLine.deleteMany({ where: { jevId: { in: jevIds } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevIds } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('Inventory → GL', () => {
  it('stock receipt groups cost by each item account (accountCode override + class default)', async () => {
    const receiptId = randomUUID();
    createdSourceIds.add(receiptId);
    await runAudited(prisma, userId, (tx) =>
      autoJev.onStockReceiptPosted(tx, organizationId, userId, {
        id: receiptId,
        receiptNumber: 'TEST-SR-1',
        receiptDate: new Date('2026-08-12'),
        items: [
          { totalCost: 5000, accountCode: null, classification: 'expendable' },
          { totalCost: 3000, accountCode: OVERRIDE_PPE_CODE, classification: 'ppe' },
        ],
      }),
    );

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'stock_receipts', sourceId: receiptId },
      include: { lines: true },
    });
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);

    expect(debit(expendableInvId)).toBeCloseTo(5000, 2); // classification default
    expect(debit(overridePpeId)).toBeCloseTo(3000, 2); // item's own accountCode
    expect(credit(apId)).toBeCloseTo(8000, 2);
    const td = jev.lines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const tc = jev.lines.reduce((s, l) => s + Number(l.creditAmount), 0);
    expect(td).toBeCloseTo(tc, 2);
  });

  it('RIS issuance posts Dr supplies expense, Cr the item inventory account', async () => {
    const risId = randomUUID();
    createdSourceIds.add(risId);
    await runAudited(prisma, userId, (tx) =>
      autoJev.onRisIssued(tx, organizationId, userId, {
        id: risId,
        risNumber: 'TEST-RIS-1',
        issuedItems: [
          { quantityIssued: 10, unitCost: 50, accountCode: null, classification: 'expendable' },
        ],
      }),
    );

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'requisition_issue_slips', sourceId: risId },
      include: { lines: true },
    });
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);

    expect(debit(expenseId)).toBeCloseTo(500, 2); // 10 * 50
    expect(credit(expendableInvId)).toBeCloseTo(500, 2);
  });
});
