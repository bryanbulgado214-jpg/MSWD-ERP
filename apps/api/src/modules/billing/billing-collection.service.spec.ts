// billing-collection.service.spec.ts — INTEGRATION TESTS (real PostgreSQL).
//
// Exercises the revenue cycle → GL:
//  1. generateBills posts a balanced accrual JEV (Dr A/R, Cr Water Sales).
//  2. Recording a payment posts a collection JEV (Dr Cash-Collecting Officers,
//     Cr A/R).
//  3. Voiding the payment posts the reversing JEV (Dr A/R, Cr Cash-CO).
//
// Point DATABASE_URL at a disposable seeded database. Seeds its own billing
// chain (rate schedule → consumer → meter → reading → period) and cleans up.

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';

import { BillService } from './bill.service';
import { PaymentService } from './payment.service';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);
const billService = new BillService(prisma as unknown as PrismaService, autoJev);
const paymentService = new PaymentService(prisma as unknown as PrismaService, autoJev);

const RATE_NAME = 'TEST BILLING Rate';
const ACCT = 'TEST-BILL-0001';
const SERIAL = 'TEST-BILL-MTR-1';
const PERIOD_NAME = 'TEST BILLING Period';
const OR_NUMBER = `TEST-OR-${Date.now().toString().slice(-8)}`;
const MIN_CHARGE = 250;

let organizationId: string;
let userId: string;
let arAccountId: string;
let cashCoAccountId: string;
let waterRevenueId: string;

let periodId: string;
let consumerId: string;
let meterId: string;
let billId: string;
let paymentId: string;
let paymentVersion: number;

async function resolveMapping(mappingKey: string): Promise<string> {
  const m = await prisma.accountMapping.findFirstOrThrow({
    where: { organizationId, mappingKey, isActive: true },
    select: { chartOfAccountId: true },
  });
  return m.chartOfAccountId;
}

async function cleanupFixtures() {
  const period = await prisma.billingPeriod.findFirst({
    where: { organizationId, name: PERIOD_NAME },
    select: { id: true },
  });
  const payments = await prisma.payment.findMany({
    where: { organizationId, orNumber: { startsWith: 'TEST-OR-' } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  const jevSourceIds = [...paymentIds, ...(period ? [period.id] : [])];
  if (jevSourceIds.length) {
    const jevs = await prisma.journalEntryVoucher.findMany({
      where: {
        sourceId: { in: jevSourceIds },
        sourceTable: { in: ['payments', 'billing_periods'] },
      },
      select: { id: true },
    });
    const jevIds = jevs.map((j) => j.id);
    await prisma.jevLine.deleteMany({ where: { jevId: { in: jevIds } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevIds } } }).catch(() => {});
  }
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => {});
  if (period) {
    await prisma.bill.deleteMany({ where: { billingPeriodId: period.id } }).catch(() => {});
    await prisma.meterReading.deleteMany({ where: { billingPeriodId: period.id } }).catch(() => {});
    await prisma.billingPeriod.delete({ where: { id: period.id } }).catch(() => {});
  }
  await prisma.consumerMeter
    .deleteMany({ where: { consumer: { organizationId, accountNumber: ACCT } } })
    .catch(() => {});
  await prisma.consumer
    .deleteMany({ where: { organizationId, accountNumber: ACCT } })
    .catch(() => {});
  await prisma.meter
    .deleteMany({ where: { organizationId, serialNumber: SERIAL } })
    .catch(() => {});
  await prisma.rateSchedule
    .deleteMany({ where: { organizationId, name: RATE_NAME } })
    .catch(() => {});
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { organizationId } })).id;

  arAccountId = await resolveMapping('ar.trade_receivable');
  cashCoAccountId = await resolveMapping('cash.collecting_officer');
  waterRevenueId = await resolveMapping('revenue.water_sales');

  await cleanupFixtures();

  await prisma.rateSchedule.create({
    data: {
      organizationId,
      name: RATE_NAME,
      consumerType: 'residential',
      effectiveDate: new Date('2026-01-01'),
      minimumCharge: MIN_CHARGE,
      minimumConsumption: 10,
      isActive: true,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  const consumer = await prisma.consumer.create({
    data: {
      organizationId,
      accountNumber: ACCT,
      firstName: 'Test',
      lastName: 'Consumer',
      address: 'Test address',
      consumerType: 'residential',
      status: 'active',
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true },
  });
  consumerId = consumer.id;
  const meter = await prisma.meter.create({
    data: { organizationId, serialNumber: SERIAL, createdBy: userId, updatedBy: userId },
    select: { id: true },
  });
  meterId = meter.id;
  const period = await prisma.billingPeriod.create({
    data: {
      organizationId,
      name: PERIOD_NAME,
      billingMonth: 8,
      billingYear: 2026,
      dueDate: new Date('2026-09-15'),
      penaltyDate: new Date('2026-09-30'),
      status: 'reading',
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true },
  });
  periodId = period.id;
  await prisma.meterReading.create({
    data: {
      organizationId,
      consumerId,
      meterId,
      billingPeriodId: periodId,
      readingDate: new Date('2026-08-20'),
      previousReading: 0,
      currentReading: 8,
      consumption: 8, // <= minimumConsumption (10) → water charge = minimum charge
      status: 'confirmed',
      createdBy: userId,
      updatedBy: userId,
    },
  });
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('Billing & collections → GL', () => {
  it('generateBills posts a balanced accrual JEV (Dr A/R, Cr Water Sales)', async () => {
    const result = await billService.generateBills(organizationId, userId, periodId);
    expect(result.generated).toBe(1);

    const bill = await prisma.bill.findFirstOrThrow({
      where: { organizationId, billingPeriodId: periodId, consumerId },
      select: { id: true, waterCharge: true, totalAmount: true },
    });
    billId = bill.id;
    expect(Number(bill.waterCharge)).toBeCloseTo(MIN_CHARGE, 2);

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'billing_periods', sourceId: periodId },
      include: { lines: true },
    });
    expect(jev.status).toBe('posted');
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);
    expect(debit(arAccountId)).toBeCloseTo(MIN_CHARGE, 2);
    expect(credit(waterRevenueId)).toBeCloseTo(MIN_CHARGE, 2);
    const totalDebit = jev.lines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const totalCredit = jev.lines.reduce((s, l) => s + Number(l.creditAmount), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  it('recording a payment posts the collection JEV (Dr Cash-CO, Cr A/R)', async () => {
    const payment = await paymentService.create(organizationId, userId, {
      orNumber: OR_NUMBER,
      consumerId,
      paymentDate: '2026-08-15',
      totalAmount: MIN_CHARGE,
      paymentMethod: 'cash',
      allocations: [{ billId, amountApplied: MIN_CHARGE }],
    });
    paymentId = payment.id;
    paymentVersion = payment.version;

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'payments', sourceId: paymentId },
      include: { lines: true },
    });
    expect(jev.status).toBe('posted');
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);
    expect(debit(cashCoAccountId)).toBeCloseTo(MIN_CHARGE, 2);
    expect(credit(arAccountId)).toBeCloseTo(MIN_CHARGE, 2);
  });

  it('voiding the payment posts the reversing JEV (Dr A/R, Cr Cash-CO)', async () => {
    await paymentService.voidPayment(
      organizationId,
      userId,
      paymentId,
      paymentVersion,
      'test void',
    );

    const jevs = await prisma.journalEntryVoucher.findMany({
      where: { organizationId, sourceTable: 'payments', sourceId: paymentId },
      include: { lines: true },
    });
    // Two JEVs now: the collection and its reversal.
    expect(jevs.length).toBe(2);
    const reversal = jevs.find((j) =>
      j.lines.some((l) => l.chartOfAccountId === arAccountId && Number(l.debitAmount) > 0),
    );
    expect(reversal).toBeDefined();
    const arDebit = Number(
      reversal!.lines.find((l) => l.chartOfAccountId === arAccountId)?.debitAmount ?? 0,
    );
    const cashCredit = Number(
      reversal!.lines.find((l) => l.chartOfAccountId === cashCoAccountId)?.creditAmount ?? 0,
    );
    expect(arDebit).toBeCloseTo(MIN_CHARGE, 2);
    expect(cashCredit).toBeCloseTo(MIN_CHARGE, 2);
  });
});
