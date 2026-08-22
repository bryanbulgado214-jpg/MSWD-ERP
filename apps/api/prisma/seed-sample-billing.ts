import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import { AutoJevService } from '../src/modules/accounting/auto-jev.service';
import { CollectionBatchService } from '../src/modules/accounting/collection-batch.service';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectionBatchService = new CollectionBatchService(prisma as any, autoJev);

const RATE_NAME = 'SMP Residential Rate';
const CONSUMERS: Array<{
  acct: string;
  first: string;
  last: string;
  senior: boolean;
  mtr: string;
  addr: string;
}> = [
  {
    acct: 'SMP-0001',
    first: 'Juan',
    last: 'Dela Cruz',
    senior: false,
    mtr: 'SMP-MTR-0001',
    addr: 'Poblacion, Siquijor',
  },
  {
    acct: 'SMP-0002',
    first: 'Maria',
    last: 'Santos',
    senior: true,
    mtr: 'SMP-MTR-0002',
    addr: 'Poblacion, Siquijor',
  },
  {
    acct: 'SMP-0003',
    first: 'Pedro',
    last: 'Reyes',
    senior: false,
    mtr: 'SMP-MTR-0003',
    addr: 'Poblacion, Siquijor',
  },
  {
    acct: 'SMP-0004',
    first: 'Ana',
    last: 'Villanueva',
    senior: false,
    mtr: 'SMP-MTR-0004',
    addr: 'Caipilan, Siquijor',
  },
  {
    acct: 'SMP-0005',
    first: 'Jose',
    last: 'Ramos',
    senior: false,
    mtr: 'SMP-MTR-0005',
    addr: 'Luyang, Siquijor',
  },
  {
    acct: 'SMP-0006',
    first: 'Rosa',
    last: 'Aquino',
    senior: true,
    mtr: 'SMP-MTR-0006',
    addr: 'Pangi, Siquijor',
  },
  {
    acct: 'SMP-0007',
    first: 'Mark',
    last: 'Torres',
    senior: false,
    mtr: 'SMP-MTR-0007',
    addr: 'Tebjong, Siquijor',
  },
  {
    acct: 'SMP-0008',
    first: 'Liza',
    last: 'Gonzales',
    senior: false,
    mtr: 'SMP-MTR-0008',
    addr: 'Dumanhog, Siquijor',
  },
  {
    acct: 'SMP-0009',
    first: 'Ben',
    last: 'Castro',
    senior: false,
    mtr: 'SMP-MTR-0009',
    addr: 'Canal, Siquijor',
  },
  {
    acct: 'SMP-0010',
    first: 'Grace',
    last: 'Flores',
    senior: false,
    mtr: 'SMP-MTR-0010',
    addr: 'Cang-apa, Siquijor',
  },
  {
    acct: 'SMP-0011',
    first: 'Danilo',
    last: 'Mendoza',
    senior: true,
    mtr: 'SMP-MTR-0011',
    addr: 'Cang-alwang, Siquijor',
  },
  {
    acct: 'SMP-0012',
    first: 'Carmen',
    last: 'Diaz',
    senior: false,
    mtr: 'SMP-MTR-0012',
    addr: 'Tambisan, Siquijor',
  },
  {
    acct: 'SMP-0013',
    first: 'Elmer',
    last: 'Bautista',
    senior: false,
    mtr: 'SMP-MTR-0013',
    addr: 'Tulapos, Siquijor',
  },
];
// Billing cut-off is 8/22/2026 (the demo "today"). Only periods that have ended
// by then are billed — August (period-end 8/31) has not arrived yet, so no
// August bill is posted. Penalty falls due on the 25th of each bill's due month.
const PERIODS = [
  { name: 'SMP June 2026', month: 6, due: '2026-07-15', pen: '2026-07-25' },
  { name: 'SMP July 2026', month: 7, due: '2026-08-15', pen: '2026-08-25' },
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
  'SMP-0004': [
    { prev: 0, cur: 15 },
    { prev: 15, cur: 33 },
    { prev: 33, cur: 53 },
  ],
  'SMP-0005': [
    { prev: 0, cur: 10 },
    { prev: 10, cur: 22 },
    { prev: 22, cur: 36 },
  ],
  'SMP-0006': [
    { prev: 0, cur: 8 },
    { prev: 8, cur: 17 },
    { prev: 17, cur: 27 },
  ],
  'SMP-0007': [
    { prev: 0, cur: 22 },
    { prev: 22, cur: 47 },
    { prev: 47, cur: 67 },
  ],
  'SMP-0008': [
    { prev: 0, cur: 12 },
    { prev: 12, cur: 24 },
    { prev: 24, cur: 36 },
  ],
  'SMP-0009': [
    { prev: 0, cur: 30 },
    { prev: 30, cur: 62 },
    { prev: 62, cur: 90 },
  ],
  'SMP-0010': [
    { prev: 0, cur: 14 },
    { prev: 14, cur: 30 },
    { prev: 30, cur: 48 },
  ],
  'SMP-0011': [
    { prev: 0, cur: 9 },
    { prev: 9, cur: 20 },
    { prev: 20, cur: 33 },
  ],
  'SMP-0012': [
    { prev: 0, cur: 16 },
    { prev: 16, cur: 31 },
    { prev: 31, cur: 48 },
  ],
  'SMP-0013': [
    { prev: 0, cur: 16 },
    { prev: 16, cur: 30 },
    { prev: 30, cur: 42 },
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
  const batches = await prisma.collectionAccountingBatch.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const batchIds = batches.map((b) => b.id);
  const jevs = await prisma.journalEntryVoucher.findMany({
    where: {
      OR: [
        {
          sourceId: { in: [...pids, ...payids, ...batchIds] },
          sourceTable: { in: ['billing_periods', 'payments', 'collection_accounting_batches'] },
        },
        // Daily summary vouchers carry no single sourceId — clear the org's.
        { organizationId, sourceTable: { in: ['daily_collection', 'daily_penalty'] } },
      ],
    },
    select: { id: true },
  });
  const jevids = jevs.map((j) => j.id);
  await prisma.jevLine.deleteMany({ where: { jevId: { in: jevids } } });
  await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevids } } });
  await prisma.collectionDeposit.deleteMany({ where: { organizationId } });
  await prisma.collectionAccountingBatch.deleteMany({ where: { organizationId } });
  await prisma.tellerSession.deleteMany({ where: { organizationId } });
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
        address: c.addr,
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

  // Payment scenarios for the additional consumers. Every seeded payment is
  // dated BEFORE its bill's due date, so no penalty is charged at seed time —
  // any bill left unpaid is now overdue and will accrue the 10% penalty when the
  // teller collects, which is what these are for. Amount "full" pays the current
  // balance (handles the senior-citizen discount); a number is a partial payment.
  const PAY_PLANS: Record<
    string,
    Array<{ period: string; amount: number | 'full'; date: string }>
  > = {
    // SMP-0004 Villanueva — nothing paid (all three bills open).
    'SMP-0005': [{ period: 'June', amount: 'full', date: '2026-07-10' }], // July + Aug open
    'SMP-0006': [
      { period: 'June', amount: 'full', date: '2026-07-12' },
      { period: 'July', amount: 'full', date: '2026-08-08' },
    ], // senior; only Aug open (not yet due)
    'SMP-0007': [{ period: 'June', amount: 300, date: '2026-07-09' }], // partial June, rest open
    'SMP-0008': [
      { period: 'June', amount: 'full', date: '2026-07-10' },
      { period: 'July', amount: 'full', date: '2026-08-05' },
    ], // fully settled
    // SMP-0009 Castro — nothing paid (high usage, large overdue balance).
    'SMP-0010': [
      { period: 'June', amount: 'full', date: '2026-07-09' },
      { period: 'July', amount: 'full', date: '2026-08-08' },
    ], // fully settled
    // SMP-0011 Mendoza — senior, nothing paid.
    'SMP-0012': [
      { period: 'June', amount: 'full', date: '2026-07-11' },
      { period: 'July', amount: 'full', date: '2026-08-06' },
    ], // Aug open
    'SMP-0013': [{ period: 'June', amount: 200, date: '2026-07-10' }], // partial June, rest open
  };

  let orSeq = 4;
  for (const acct of Object.keys(PAY_PLANS)) {
    const bills = await billsOf(acct);
    for (const plan of PAY_PLANS[acct]!) {
      const bill = bills.find((b) => b.billingPeriod.name.includes(plan.period));
      if (!bill) continue;
      const amount = plan.amount === 'full' ? Number(bill.balance) : plan.amount;
      if (amount <= 0) continue;
      await paymentService.create(org.id, user.id, {
        orNumber: `SMP-OR-${String(orSeq++).padStart(4, '0')}`,
        consumerId: consumerByAcct[acct]!,
        paymentDate: plan.date,
        totalAmount: amount,
        paymentMethod: 'cash',
        allocations: [{ billId: bill.id, amountApplied: amount }],
      });
    }
  }

  // Accrue the 10% penalty on bills whose penalty date (the 25th) has passed as
  // of the 8/22/2026 cut-off and are still owing — each posts a Dr A/R,
  // Cr Penalty Income auto-JEV that the ledger references.
  const { accrued } = await billService.accruePenalties(org.id, user.id, new Date('2026-08-22'));
  console.log(`Accrued 10% penalty on ${accrued} overdue bill(s).`);

  // Collections no longer post a GL entry at receipt time — they post when the
  // Cashier finalizes the daily batch. Consolidate each collection day into a
  // "for review" batch so the Accounting → Collection Batches screen has real
  // batches to review and FINALIZE (which auto-posts the daily collection JEV).
  const dates = await prisma.payment.findMany({
    where: { organizationId: org.id, consumerId: { in: Object.values(consumerByAcct) } },
    distinct: ['paymentDate'],
    select: { paymentDate: true },
    orderBy: { paymentDate: 'asc' },
  });
  for (const { paymentDate } of dates) {
    const d = paymentDate.toISOString().slice(0, 10);
    await collectionBatchService.consolidate(org.id, user.id, d);
  }
  console.log(`Consolidated ${dates.length} daily collection batch(es) — ready to finalize.`);

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
