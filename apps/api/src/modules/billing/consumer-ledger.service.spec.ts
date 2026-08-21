// consumer-ledger.service.spec.ts — INTEGRATION TEST (real PostgreSQL).
//
// Verifies the running-balance ("passbook") consumer ledger: bills and payments
// are interleaved in date order with a correct running balance. Point
// DATABASE_URL at a disposable seeded database.

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';

import { BillingReportService } from './billing-report.service';

const prisma = new PrismaClient();
const service = new BillingReportService(prisma as unknown as PrismaService);

const ACCT = 'TEST-SOA-ACCT';
const PERIOD_PREFIX = 'TEST SOA Period';
const B1 = 'TEST-SOA-B1';
const B2 = 'TEST-SOA-B2';
const OR1 = 'TEST-SOA-OR1';

let organizationId: string;
let userId: string;
let consumerId: string;

async function cleanupFixtures() {
  await prisma.payment
    .deleteMany({ where: { organizationId, orNumber: { startsWith: 'TEST-SOA-OR' } } })
    .catch(() => {});
  await prisma.bill
    .deleteMany({ where: { organizationId, billNumber: { startsWith: 'TEST-SOA-B' } } })
    .catch(() => {});
  await prisma.billingPeriod
    .deleteMany({ where: { organizationId, name: { startsWith: PERIOD_PREFIX } } })
    .catch(() => {});
  await prisma.consumer
    .deleteMany({ where: { organizationId, accountNumber: ACCT } })
    .catch(() => {});
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { organizationId } })).id;

  await cleanupFixtures();

  const consumer = await prisma.consumer.create({
    data: {
      organizationId,
      accountNumber: ACCT,
      firstName: 'Test',
      lastName: 'Ledger',
      address: 'Test',
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true },
  });
  consumerId = consumer.id;
  // One bill per period (Bill enforces @@unique([consumerId, billingPeriodId])).
  const period1 = await prisma.billingPeriod.create({
    data: {
      organizationId,
      name: `${PERIOD_PREFIX} 1`,
      billingMonth: 6,
      billingYear: 2099,
      dueDate: new Date('2026-09-15'),
      penaltyDate: new Date('2026-09-30'),
      createdBy: userId,
    },
    select: { id: true },
  });
  const period2 = await prisma.billingPeriod.create({
    data: {
      organizationId,
      name: `${PERIOD_PREFIX} 2`,
      billingMonth: 8,
      billingYear: 2099,
      dueDate: new Date('2026-10-15'),
      penaltyDate: new Date('2026-10-30'),
      createdBy: userId,
    },
    select: { id: true },
  });

  const billBase = {
    organizationId,
    consumerId,
    consumption: 10,
    dueDate: new Date('2026-09-15'),
    penaltyDate: new Date('2026-09-30'),
    createdBy: userId,
    updatedBy: userId,
  };
  // Bill 1 (older), Payment (mid), Bill 2 (newer) → interleaved by date.
  await prisma.bill.create({
    data: {
      ...billBase,
      billingPeriodId: period1.id,
      billNumber: B1,
      totalAmount: 500,
      balance: 100,
      amountPaid: 400,
      createdAt: new Date('2026-08-01'),
    },
  });
  await prisma.payment.create({
    data: {
      organizationId,
      orNumber: OR1,
      consumerId,
      paymentDate: new Date('2099-07-05'),
      totalAmount: 400,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  await prisma.bill.create({
    data: {
      ...billBase,
      billingPeriodId: period2.id,
      billNumber: B2,
      totalAmount: 300,
      balance: 300,
      createdAt: new Date('2026-08-20'),
    },
  });
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('Consumer ledger (running balance)', () => {
  it('interleaves bills and payments in date order with a running balance', async () => {
    const res = await service.getConsumerLedger(organizationId, consumerId);

    expect(res.totalBilled).toBeCloseTo(800, 2);
    expect(res.totalPaid).toBeCloseTo(400, 2);
    expect(res.balance).toBeCloseTo(400, 2);
    expect(res.ledger).toHaveLength(3);

    // Row 0: Bill 1 charge 500 → balance 500
    expect(res.ledger[0]!.reference).toBe(B1);
    expect(res.ledger[0]!.charges).toBeCloseTo(500, 2);
    expect(res.ledger[0]!.balance).toBeCloseTo(500, 2);
    // Row 1: Payment 400 (interleaved) → balance 100
    expect(res.ledger[1]!.reference).toBe(OR1);
    expect(res.ledger[1]!.payments).toBeCloseTo(400, 2);
    expect(res.ledger[1]!.balance).toBeCloseTo(100, 2);
    // Row 2: Bill 2 charge 300 → balance 400
    expect(res.ledger[2]!.reference).toBe(B2);
    expect(res.ledger[2]!.charges).toBeCloseTo(300, 2);
    expect(res.ledger[2]!.balance).toBeCloseTo(400, 2);
  });
});
