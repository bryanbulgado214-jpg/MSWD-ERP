import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import { AutoJevService } from '../src/modules/accounting/auto-jev.service';
import { BillService } from '../src/modules/billing/bill.service';
import { PaymentService } from '../src/modules/billing/payment.service';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const autoJev = new AutoJevService(prisma as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const billService = new BillService(prisma as any, autoJev);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paymentService = new PaymentService(prisma as any, autoJev);

const RATE_NAME = 'SMP Residential Rate';
const CONSUMERS = [
  { acct: 'SMP-0001', first: 'Juan', last: 'Dela Cruz', senior: false, mtr: 'SMP-MTR-0001' },
  { acct: 'SMP-0002', first: 'Maria', last: 'Santos', senior: true, mtr: 'SMP-MTR-0002' },
  { acct: 'SMP-0003', first: 'Pedro', last: 'Reyes', senior: false, mtr: 'SMP-MTR-0003' },
];
const PERIODS = [
  { name: 'SMP June 2026', month: 6, due: '2026-07-15', pen: '2026-07-31' },
  { name: 'SMP July 2026', month: 7, due: '2026-08-15', pen: '2026-08-31' },
  { name: 'SMP August 2026', month: 8, due: '2026-09-15', pen: '2026-09-30' },
];
// Cumulative meter readings per consumer per period.
const READINGS: Record<string, Array<{ prev: number; cur: number }>> = {
  'SMP-0001': [
    { prev: 0, cur: 12 },
    { prev: 12, cur: 26 },
    { prev: 26, cur: 40 },
  ],
  'SMP-0002': [
    { prev: 0, cur: 8 },
    { prev: 8, cur: 18 },
    { prev: 18, cur: 30 },
  ],
  'SMP-0003': [
    { prev: 0, cur: 20 },
    { prev: 20, cur: 45 },
    { prev: 45, cur: 70 },
  ],
};

async function wipe(organizationId: string) {
  const consumers = await prisma.consumer.findMany({
    where: { organizationId, accountNumber: { startsWith: 'SMP-' } },
    select: { id: true },
  });
  const cids = consumers.map((c) => c.id);
  const periods = await prisma.billingPeriod.findMany({
    where: { organizationId, name: { startsWith: 'SMP ' } },
    select: { id: true },
  });
  const pids = periods.map((p) => p.id);
  const payments = await prisma.payment.findMany({
    where: { organizationId, consumerId: { in: cids } },
    select: { id: true },
  });
  const payids = payments.map((p) => p.id);
  const jevs = await prisma.journalEntryVoucher.findMany({
    where: {
      sourceId: { in: [...pids, ...payids] },
      sourceTable: { in: ['billing_periods', 'payments'] },
    },
    select: { id: true },
  });
  const jevids = jevs.map((j) => j.id);
  await prisma.jevLine.deleteMany({ where: { jevId: { in: jevids } } });
  await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevids } } });
  await prisma.payment.deleteMany({ where: { id: { in: payids } } });
  await prisma.bill.deleteMany({ where: { consumerId: { in: cids } } });
  await prisma.meterReading.deleteMany({ where: { consumerId: { in: cids } } });
  await prisma.consumerMeter.deleteMany({ where: { consumerId: { in: cids } } });
  await prisma.consumer.deleteMany({ where: { id: { in: cids } } });
  await prisma.meter.deleteMany({
    where: { organizationId, serialNumber: { startsWith: 'SMP-MTR-' } },
  });
  await prisma.billingPeriod.deleteMany({ where: { id: { in: pids } } });
  await prisma.rateSchedule.deleteMany({ where: { organizationId, name: RATE_NAME } });
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  const user = await prisma.user.findFirstOrThrow({
    where: { organizationId: org.id, username: 'sbwd.admin' },
    select: { id: true },
  });

  await wipe(org.id);
  if (process.argv.includes('wipe')) {
    console.log('Sample billing data removed.');
    return;
  }

  // Rate: ₱250 minimum up to 10 cu.m, then ₱25 per cu.m above 10.
  await prisma.rateSchedule.create({
    data: {
      organizationId: org.id,
      name: RATE_NAME,
      consumerType: 'residential',
      effectiveDate: new Date('2026-01-01'),
      minimumCharge: 250,
      minimumConsumption: 10,
      isActive: true,
      createdBy: user.id,
      updatedBy: user.id,
      tiers: {
        create: [{ minConsumption: 10, maxConsumption: null, ratePerCubicMeter: 25, sortOrder: 1 }],
      },
    },
  });

  const consumerByAcct: Record<string, string> = {};
  const meterByAcct: Record<string, string> = {};
  for (const c of CONSUMERS) {
    const consumer = await prisma.consumer.create({
      data: {
        organizationId: org.id,
        accountNumber: c.acct,
        firstName: c.first,
        lastName: c.last,
        address: 'Poblacion, Siquijor',
        consumerType: 'residential',
        status: 'active',
        isSeniorCitizen: c.senior,
        connectionDate: new Date('2026-05-15'),
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: { id: true },
    });
    consumerByAcct[c.acct] = consumer.id;
    const meter = await prisma.meter.create({
      data: {
        organizationId: org.id,
        serialNumber: c.mtr,
        brand: 'Metro',
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: { id: true },
    });
    meterByAcct[c.acct] = meter.id;
    await prisma.consumerMeter.create({
      data: { consumerId: consumer.id, meterId: meter.id, installedDate: new Date('2026-05-15') },
    });
  }

  for (let i = 0; i < PERIODS.length; i++) {
    const P = PERIODS[i]!;
    const period = await prisma.billingPeriod.create({
      data: {
        organizationId: org.id,
        name: P.name,
        billingMonth: P.month,
        billingYear: 2026,
        dueDate: new Date(P.due),
        penaltyDate: new Date(P.pen),
        status: 'reading',
        createdBy: user.id,
      },
      select: { id: true },
    });
    for (const c of CONSUMERS) {
      const r = READINGS[c.acct]![i]!;
      await prisma.meterReading.create({
        data: {
          organizationId: org.id,
          consumerId: consumerByAcct[c.acct]!,
          meterId: meterByAcct[c.acct]!,
          billingPeriodId: period.id,
          readingDate: new Date(Date.UTC(2026, P.month - 1, 25)),
          previousReading: r.prev,
          currentReading: r.cur,
          consumption: r.cur - r.prev,
          status: 'confirmed',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    }
    const result = await billService.generateBills(org.id, user.id, period.id);
    console.log(`${P.name}: generated ${result.generated} bill(s)`);
  }

  // Payments: C1 pays June + July in full; C2 pays June partially; C3 unpaid.
  const billsOf = (acct: string) =>
    prisma.bill.findMany({
      where: { consumerId: consumerByAcct[acct]! },
      include: { billingPeriod: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

  const c1Bills = await billsOf('SMP-0001');
  const c1June = c1Bills.find((b) => b.billingPeriod.name.includes('June'))!;
  const c1July = c1Bills.find((b) => b.billingPeriod.name.includes('July'))!;
  await paymentService.create(org.id, user.id, {
    orNumber: 'SMP-OR-0001',
    consumerId: consumerByAcct['SMP-0001']!,
    paymentDate: '2026-07-05',
    totalAmount: Number(c1June.balance),
    paymentMethod: 'cash',
    allocations: [{ billId: c1June.id, amountApplied: Number(c1June.balance) }],
  });
  await paymentService.create(org.id, user.id, {
    orNumber: 'SMP-OR-0002',
    consumerId: consumerByAcct['SMP-0001']!,
    paymentDate: '2026-08-06',
    totalAmount: Number(c1July.balance),
    paymentMethod: 'cash',
    allocations: [{ billId: c1July.id, amountApplied: Number(c1July.balance) }],
  });

  const c2Bills = await billsOf('SMP-0002');
  const c2June = c2Bills.find((b) => b.billingPeriod.name.includes('June'))!;
  await paymentService.create(org.id, user.id, {
    orNumber: 'SMP-OR-0003',
    consumerId: consumerByAcct['SMP-0002']!,
    paymentDate: '2026-07-08',
    totalAmount: 100,
    paymentMethod: 'cash',
    allocations: [{ billId: c2June.id, amountApplied: 100 }],
  });

  console.log('\nSample billing data seeded. Open Billing → Consumers → (consumer) → Print SOA:');
  for (const c of CONSUMERS)
    console.log(`  ${c.acct}  ${c.last}, ${c.first}${c.senior ? '  (senior)' : ''}`);
  console.log('\nRe-run with "wipe" to remove it:  ts-node prisma/seed-sample-billing.ts wipe');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
