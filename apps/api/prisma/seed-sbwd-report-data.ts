/**
 * DEMO SEED — SBWD report sample data (AR aging + fixed-asset lapsing)
 * ------------------------------------------------------------------
 * Populates the two operational tables the accountant's Reports tab reads
 * directly (NOT the General Ledger), so the "AR Aging" and "Fixed-Asset
 * Lapsing" reports show live data in the demo:
 *
 *   • billing.bills  → Accounts-Receivable Aging  (overdue water bills)
 *   • asset.property_records → Fixed-Asset Lapsing (depreciable PPE)
 *
 * These are pure operational records. They do NOT post journal entries and
 * therefore do NOT touch the Trial Balance / Financial Statements or the
 * A = L + E tie-out that seed-demo-sbwd.ts is careful to preserve.
 *
 * DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS.
 *
 * Idempotent: every row is upserted on its natural unique key, so this is
 * safe to re-run. It ONLY touches the SBWD organization.
 *
 * Run:  npx ts-node prisma/seed-sbwd-report-data.ts     (from apps/api)
 */
import * as path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_CODE = 'SBWD';
const round2 = (n: number) => Math.round(n * 100) / 100;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** dueDate + 15 days → penalty date */
const plus15 = (iso: string) => {
  const t = d(iso);
  t.setUTCDate(t.getUTCDate() + 15);
  return t;
};

async function main() {
  const org = await prisma.organization.findUnique({ where: { code: ORG_CODE } });
  if (!org) {
    throw new Error(
      `Organization ${ORG_CODE} not found. Run "npm run seed:demo" first to create the demo org.`,
    );
  }
  const orgId = org.id;

  // Actor for the audit trigger (falls back to any user in the org).
  const actor =
    (await prisma.user.findFirst({
      where: { username: 'demo.accountant' },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { userRoles: { some: { role: { organizationId: orgId } } } },
      select: { id: true },
    }));
  const actorId = actor?.id ?? '';

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('app.current_user_id', ${actorId}, true)`);

    // ================================================================
    // 1) ACCOUNTS-RECEIVABLE AGING — overdue water bills
    // ================================================================
    // Four monthly billing periods. Aging is computed from each BILL's
    // own dueDate against "today", so these dueDates spread the arrears
    // across all four brackets (as of ~Aug 2026):
    //   Apr due 04-20 → 90+   May due 05-20 → 61-90
    //   Jun due 06-20 → 31-60 Jul due 07-20 → 1-30
    // ----------------------------------------------------------------
    type Period = { month: number; year: number; name: string; due: string };
    const periods: Period[] = [
      { month: 4, year: 2026, name: 'April 2026', due: '2026-04-20' },
      { month: 5, year: 2026, name: 'May 2026', due: '2026-05-20' },
      { month: 6, year: 2026, name: 'June 2026', due: '2026-06-20' },
      { month: 7, year: 2026, name: 'July 2026', due: '2026-07-20' },
    ];
    const periodIds: Record<string, string> = {};
    for (const p of periods) {
      const rec = await tx.billingPeriod.upsert({
        where: {
          organizationId_billingMonth_billingYear: {
            organizationId: orgId,
            billingMonth: p.month,
            billingYear: p.year,
          },
        },
        update: { name: p.name, dueDate: d(p.due), penaltyDate: plus15(p.due) },
        create: {
          organizationId: orgId,
          name: p.name,
          billingMonth: p.month,
          billingYear: p.year,
          dueDate: d(p.due),
          penaltyDate: plus15(p.due),
          status: 'open',
        },
        select: { id: true },
      });
      periodIds[`${p.year}-${p.month}`] = rec.id;
    }

    type Cons = {
      acct: string;
      first: string;
      last: string;
      type: 'residential' | 'commercial' | 'industrial' | 'government' | 'bulk';
      business?: string;
      senior?: boolean;
      pwd?: boolean;
      address: string;
    };
    const consumers: Cons[] = [
      {
        acct: 'SB-0001',
        first: 'Juan',
        last: 'Dela Cruz',
        type: 'residential',
        address: 'Purok 1, Poblacion, Sta. Barbara, Iloilo',
      },
      {
        acct: 'SB-0002',
        first: 'Maria',
        last: 'Santos',
        type: 'residential',
        senior: true,
        address: 'Purok 3, Poblacion, Sta. Barbara, Iloilo',
      },
      {
        acct: 'SB-0003',
        first: 'Pedro',
        last: 'Villanueva',
        type: 'commercial',
        business: 'Villanueva Sari-Sari Store',
        address: 'Rizal St., Poblacion, Sta. Barbara, Iloilo',
      },
      {
        acct: 'SB-0004',
        first: 'Office of the',
        last: 'Market Administrator',
        type: 'commercial',
        business: 'Sta. Barbara Public Market',
        address: 'Market Site, Poblacion, Sta. Barbara, Iloilo',
      },
      {
        acct: 'SB-0005',
        first: 'Barangay',
        last: 'Poblacion',
        type: 'government',
        business: 'Barangay Poblacion Hall',
        address: 'Poblacion, Sta. Barbara, Iloilo',
      },
      {
        acct: 'SB-0006',
        first: 'Ana',
        last: 'Reyes',
        type: 'residential',
        pwd: true,
        address: 'Purok 5, Cabugao, Sta. Barbara, Iloilo',
      },
    ];
    const consumerIds: Record<string, string> = {};
    for (const c of consumers) {
      const rec = await tx.consumer.upsert({
        where: { organizationId_accountNumber: { organizationId: orgId, accountNumber: c.acct } },
        update: {},
        create: {
          organizationId: orgId,
          accountNumber: c.acct,
          firstName: c.first,
          lastName: c.last,
          businessName: c.business ?? null,
          consumerType: c.type,
          address: c.address,
          barangay: 'Poblacion',
          municipality: 'Sta. Barbara',
          province: 'Iloilo',
          isSeniorCitizen: c.senior ?? false,
          isPwd: c.pwd ?? false,
          status: 'active',
          connectionDate: d('2019-01-01'),
        },
        select: { id: true },
      });
      consumerIds[c.acct] = rec.id;
    }

    // Unpaid / partial bills. [account, year-month, total, amountPaid?]
    type BillRow = { acct: string; pk: string; consumption: number; total: number; paid?: number };
    const bills: BillRow[] = [
      // Juan Dela Cruz — chronic delinquent, all four months open
      { acct: 'SB-0001', pk: '2026-4', consumption: 19, total: 385 },
      { acct: 'SB-0001', pk: '2026-5', consumption: 21, total: 420 },
      { acct: 'SB-0001', pk: '2026-6', consumption: 20, total: 410 },
      { acct: 'SB-0001', pk: '2026-7', consumption: 19, total: 395 },
      // Maria Santos — last two months
      { acct: 'SB-0002', pk: '2026-6', consumption: 14, total: 310 },
      { acct: 'SB-0002', pk: '2026-7', consumption: 15, total: 325 },
      // Villanueva Store (commercial) — three months
      { acct: 'SB-0003', pk: '2026-5', consumption: 58, total: 2450 },
      { acct: 'SB-0003', pk: '2026-6', consumption: 62, total: 2610 },
      { acct: 'SB-0003', pk: '2026-7', consumption: 57, total: 2380 },
      // Public Market (commercial) — all four months, large balances
      { acct: 'SB-0004', pk: '2026-4', consumption: 140, total: 5900 },
      { acct: 'SB-0004', pk: '2026-5', consumption: 145, total: 6120 },
      { acct: 'SB-0004', pk: '2026-6', consumption: 137, total: 5750 },
      { acct: 'SB-0004', pk: '2026-7', consumption: 143, total: 6010 },
      // Barangay Hall (government) — two months
      { acct: 'SB-0005', pk: '2026-5', consumption: 80, total: 3400 },
      { acct: 'SB-0005', pk: '2026-7', consumption: 90, total: 3850 },
      // Ana Reyes — one partially paid (Jun) + one fully open (Jul)
      { acct: 'SB-0006', pk: '2026-6', consumption: 24, total: 520, paid: 200 },
      { acct: 'SB-0006', pk: '2026-7', consumption: 25, total: 540 },
    ];

    // per-consumer sequence for stable bill numbers
    const seq: Record<string, number> = {};
    for (const b of bills) {
      const [y, m] = b.pk.split('-').map(Number);
      const period = periods.find((p) => p.year === y && p.month === m)!;
      const paid = round2(b.paid ?? 0);
      const total = round2(b.total);
      const balance = round2(total - paid);
      seq[b.acct] = (seq[b.acct] ?? 0) + 1;
      const billNumber = `${b.acct}-${y}${String(m).padStart(2, '0')}`;
      const waterCharge = round2(total * 0.9);
      const envFee = round2(total * 0.05);
      const maint = round2(total - waterCharge - envFee);
      await tx.bill.upsert({
        where: { organizationId_billNumber: { organizationId: orgId, billNumber } },
        update: {
          totalAmount: total,
          amountPaid: paid,
          balance,
          status: paid > 0 ? 'partial' : 'unpaid',
        },
        create: {
          organizationId: orgId,
          billNumber,
          consumerId: consumerIds[b.acct]!,
          billingPeriodId: periodIds[b.pk]!,
          previousReading: 0,
          currentReading: b.consumption,
          consumption: b.consumption,
          waterCharge,
          environmentalFee: envFee,
          maintenanceFee: maint,
          totalAmount: total,
          amountPaid: paid,
          balance,
          dueDate: d(period.due),
          penaltyDate: plus15(period.due),
          status: paid > 0 ? 'partial' : 'unpaid',
        },
      });
    }

    // ================================================================
    // 2) FIXED-ASSET LAPSING — depreciable property, plant & equipment
    // ================================================================
    // Asset categories (straight-line). defaultUsefulLife in years.
    type Cat = { code: string; name: string; life: number };
    const cats: Cat[] = [
      { code: 'MVE', name: 'Motor Vehicles', life: 7 },
      { code: 'MEQ', name: 'Machinery and Equipment', life: 10 },
      { code: 'ICT', name: 'Information & Communication Technology Equipment', life: 5 },
      { code: 'OFE', name: 'Furniture and Fixtures', life: 10 },
    ];
    const catIds: Record<string, string> = {};
    for (const c of cats) {
      const rec = await tx.assetCategory.upsert({
        where: { organizationId_code: { organizationId: orgId, code: c.code } },
        update: { name: c.name, defaultUsefulLife: c.life },
        create: {
          organizationId: orgId,
          code: c.code,
          name: c.name,
          depreciationMethod: 'straight_line',
          defaultUsefulLife: c.life,
          isActive: true,
        },
        select: { id: true },
      });
      catIds[c.code] = rec.id;
    }

    // Each property record needs a backing inventory item (PPE class) for
    // its name in the report. cost/salvage/life → straight-line monthly;
    // accum & book are as-of ~Aug 2026 (monthsElapsed given per row).
    type Asset = {
      propNo: string;
      cat: string;
      desc: string;
      itemCode: string;
      acquired: string;
      cost: number;
      salvage: number;
      life: number; // years
      months: number; // months elapsed as-of demo date
      serial?: string;
    };
    const assets: Asset[] = [
      {
        propNo: 'MVE-2023-001',
        cat: 'MVE',
        desc: 'Service Vehicle — Toyota Hilux 4x2',
        itemCode: 'PPE-MVE-001',
        acquired: '2023-02-15',
        cost: 1_200_000,
        salvage: 120_000,
        life: 7,
        months: 42,
        serial: 'MR0FR22G3P0000001',
      },
      {
        propNo: 'MEQ-2022-001',
        cat: 'MEQ',
        desc: 'Submersible Water Pump 15HP w/ Motor',
        itemCode: 'PPE-MEQ-001',
        acquired: '2022-06-01',
        cost: 350_000,
        salvage: 35_000,
        life: 10,
        months: 50,
      },
      {
        propNo: 'MEQ-2020-001',
        cat: 'MEQ',
        desc: 'Backhoe Loader (pipe-laying)',
        itemCode: 'PPE-MEQ-002',
        acquired: '2020-03-01',
        cost: 2_500_000,
        salvage: 250_000,
        life: 10,
        months: 77,
        serial: 'JCB3CX-778210',
      },
      {
        propNo: 'ICT-2024-001',
        cat: 'ICT',
        desc: 'Desktop Computer Set — Accounting Office',
        itemCode: 'PPE-ICT-001',
        acquired: '2024-03-01',
        cost: 85_000,
        salvage: 8_500,
        life: 5,
        months: 29,
      },
      {
        propNo: 'MEQ-2021-001',
        cat: 'MEQ',
        desc: 'Diesel Generator Set 100kVA',
        itemCode: 'PPE-MEQ-003',
        acquired: '2021-09-01',
        cost: 480_000,
        salvage: 48_000,
        life: 10,
        months: 59,
        serial: 'CUMM-100K-55231',
      },
      {
        propNo: 'OFE-2023-001',
        cat: 'OFE',
        desc: 'Office Furniture & Fixtures — Admin',
        itemCode: 'PPE-OFE-001',
        acquired: '2023-07-01',
        cost: 120_000,
        salvage: 12_000,
        life: 10,
        months: 37,
      },
    ];

    for (const a of assets) {
      const item = await tx.inventoryItem.upsert({
        where: { organizationId_itemCode: { organizationId: orgId, itemCode: a.itemCode } },
        update: { description: a.desc },
        create: {
          organizationId: orgId,
          itemCode: a.itemCode,
          description: a.desc,
          unitOfMeasure: 'unit',
          classification: 'ppe',
          category: cats.find((c) => c.code === a.cat)?.name ?? null,
          unitCost: round2(a.cost),
          onHandQuantity: 1,
          isActive: true,
        },
        select: { id: true },
      });

      const monthly = round2((a.cost - a.salvage) / (a.life * 12));
      const accum = round2(((a.cost - a.salvage) / (a.life * 12)) * a.months);
      const book = round2(a.cost - accum);
      await tx.propertyRecord.upsert({
        where: {
          organizationId_propertyNumber: { organizationId: orgId, propertyNumber: a.propNo },
        },
        update: {
          acquisitionCost: round2(a.cost),
          salvageValue: round2(a.salvage),
          estimatedUsefulLife: a.life,
          monthlyDepreciation: monthly,
          accumulatedDepreciation: accum,
          bookValue: book,
          isDisposed: false,
        },
        create: {
          organizationId: orgId,
          inventoryItemId: item.id,
          assetCategoryId: catIds[a.cat] ?? null,
          propertyNumber: a.propNo,
          serialNumber: a.serial ?? null,
          description: a.desc,
          dateAcquired: d(a.acquired),
          acquisitionCost: round2(a.cost),
          estimatedUsefulLife: a.life,
          salvageValue: round2(a.salvage),
          monthlyDepreciation: monthly,
          accumulatedDepreciation: accum,
          bookValue: book,
          condition: 'serviceable',
          isDisposed: false,
        },
      });
    }
  });

  // ---- Summary --------------------------------------------------------
  const openBills = await prisma.bill.aggregate({
    where: { organizationId: orgId, status: { in: ['unpaid', 'partial'] } },
    _sum: { balance: true },
    _count: true,
  });
  const ppe = await prisma.propertyRecord.aggregate({
    where: { organizationId: orgId, isDisposed: false, monthlyDepreciation: { not: null, gt: 0 } },
    _sum: { bookValue: true, acquisitionCost: true },
    _count: true,
  });
  console.log('\nSBWD report sample data seeded:');
  console.log(
    `  AR aging     : ${openBills._count} open bills, total balance ₱${Number(openBills._sum.balance ?? 0).toLocaleString()}`,
  );
  console.log(
    `  Fixed assets : ${ppe._count} depreciable items, net book ₱${Number(ppe._sum.bookValue ?? 0).toLocaleString()} (cost ₱${Number(ppe._sum.acquisitionCost ?? 0).toLocaleString()})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
