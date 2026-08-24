import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Seeds sample fixed assets (Property, Plant & Equipment) for SBWD: asset
 * categories mapped to UACS PPE / accumulated-depreciation / depreciation-
 * expense accounts, custody locations, PPE inventory items, and ~44 property
 * records acquired 2014–2026 with straight-line depreciation computed as of
 * August 24, 2026 (accumulated depreciation, book value, condition).
 *
 * Idempotent: upserts categories/locations/items and rebuilds the property
 * records.
 */

const AS_OF = new Date(Date.UTC(2026, 7, 24)); // 2026-08-24
const round2 = (n: number) => Math.round(n * 100) / 100;
const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());

interface Cat {
  code: string;
  name: string;
  life: number; // useful life in years
  ppe: string;
  accum: string;
  exp: string;
}
const CATS: Cat[] = [
  {
    code: 'OE',
    name: 'Office Equipment',
    life: 5,
    ppe: '1-06-05-020',
    accum: '1-06-05-021',
    exp: '5-05-01-050',
  },
  {
    code: 'ICT',
    name: 'Information & Communication Technology Equipment',
    life: 5,
    ppe: '1-06-05-030',
    accum: '1-06-05-031',
    exp: '5-05-01-050',
  },
  {
    code: 'FF',
    name: 'Furniture and Fixtures',
    life: 10,
    ppe: '1-06-07-010',
    accum: '1-06-07-011',
    exp: '5-05-01-070',
  },
  {
    code: 'MV',
    name: 'Motor Vehicles',
    life: 7,
    ppe: '1-06-06-010',
    accum: '1-06-06-011',
    exp: '5-05-01-060',
  },
  {
    code: 'ME',
    name: 'Machinery and Equipment',
    life: 10,
    ppe: '1-06-05-010',
    accum: '1-06-05-011',
    exp: '5-05-01-050',
  },
  {
    code: 'WSS',
    name: 'Water Supply Systems',
    life: 30,
    ppe: '1-06-03-040',
    accum: '1-06-03-041',
    exp: '5-05-01-030',
  },
  {
    code: 'BLDG',
    name: 'Buildings and Structures',
    life: 30,
    ppe: '1-06-04-010',
    accum: '1-06-04-011',
    exp: '5-05-01-040',
  },
];

const LOCS: Array<{ code: string; name: string }> = [
  { code: 'MAIN', name: 'Main Office — Poblacion, Siquijor' },
  { code: 'PS1', name: 'Pumping Station 1 — Cang-isad' },
  { code: 'PS2', name: 'Pumping Station 2 — Tominga' },
  { code: 'RES', name: 'Reservoir Site — Caipilan' },
  { code: 'MPOOL', name: 'Motorpool & Warehouse' },
];

interface Line {
  item: string;
  cat: string;
  loc: string;
  cost: number;
  count: number;
  firstYear: number;
  unit?: string;
}
const LINES: Line[] = [
  { item: 'Desktop Computer', cat: 'ICT', loc: 'MAIN', cost: 38000, count: 5, firstYear: 2021 },
  { item: 'Laptop Computer', cat: 'ICT', loc: 'MAIN', cost: 55000, count: 3, firstYear: 2022 },
  { item: 'Network Server', cat: 'ICT', loc: 'MAIN', cost: 180000, count: 1, firstYear: 2020 },
  { item: 'UPS Unit', cat: 'ICT', loc: 'MAIN', cost: 12000, count: 3, firstYear: 2021 },
  { item: 'Multifunction Printer', cat: 'OE', loc: 'MAIN', cost: 42000, count: 2, firstYear: 2022 },
  { item: 'Photocopier Machine', cat: 'OE', loc: 'MAIN', cost: 135000, count: 1, firstYear: 2019 },
  {
    item: 'Split-Type Air Conditioner',
    cat: 'OE',
    loc: 'MAIN',
    cost: 38000,
    count: 4,
    firstYear: 2020,
  },
  { item: 'Executive Office Desk', cat: 'FF', loc: 'MAIN', cost: 18000, count: 4, firstYear: 2019 },
  { item: 'Steel Filing Cabinet', cat: 'FF', loc: 'MAIN', cost: 9500, count: 6, firstYear: 2019 },
  {
    item: 'Conference Table Set',
    cat: 'FF',
    loc: 'MAIN',
    cost: 65000,
    count: 1,
    firstYear: 2020,
    unit: 'set',
  },
  {
    item: 'Service Pickup Truck',
    cat: 'MV',
    loc: 'MPOOL',
    cost: 1250000,
    count: 1,
    firstYear: 2021,
  },
  { item: 'Utility Motorcycle', cat: 'MV', loc: 'MPOOL', cost: 98000, count: 3, firstYear: 2022 },
  { item: 'Submersible Pump 5HP', cat: 'ME', loc: 'PS1', cost: 185000, count: 2, firstYear: 2020 },
  { item: 'Submersible Pump 5HP', cat: 'ME', loc: 'PS2', cost: 185000, count: 2, firstYear: 2023 },
  { item: 'Diesel Generator Set', cat: 'ME', loc: 'PS1', cost: 420000, count: 1, firstYear: 2019 },
  { item: 'Chlorination System', cat: 'ME', loc: 'RES', cost: 275000, count: 1, firstYear: 2020 },
  {
    item: 'Water Meter Test Bench',
    cat: 'ME',
    loc: 'MAIN',
    cost: 95000,
    count: 1,
    firstYear: 2022,
  },
  {
    item: 'Elevated Water Reservoir Tank',
    cat: 'WSS',
    loc: 'RES',
    cost: 4800000,
    count: 1,
    firstYear: 2015,
  },
  {
    item: 'Distribution Pipeline Network',
    cat: 'WSS',
    loc: 'MAIN',
    cost: 8500000,
    count: 1,
    firstYear: 2016,
    unit: 'lot',
  },
  {
    item: 'Administration Building',
    cat: 'BLDG',
    loc: 'MAIN',
    cost: 6200000,
    count: 1,
    firstYear: 2014,
    unit: 'lot',
  },
];

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  const users = await prisma.user.findMany({
    where: {
      organizationId: org.id,
      username: { in: ['demo.admin', 'demo.gm', 'demo.accountant'] },
    },
    select: { id: true, username: true },
  });
  const uid = (u: string) => users.find((x) => x.username === u)?.id ?? users[0]!.id;
  const custodianFor = (loc: string) =>
    loc === 'MPOOL'
      ? uid('demo.gm')
      : loc.startsWith('PS') || loc === 'RES'
        ? uid('demo.accountant')
        : uid('demo.admin');

  // Categories
  const catId = new Map<string, string>();
  for (const c of CATS) {
    const rec = await prisma.assetCategory.upsert({
      where: { organizationId_code: { organizationId: org.id, code: c.code } },
      update: {
        name: c.name,
        defaultUsefulLife: c.life,
        ppeAccountCode: c.ppe,
        accumDeprAccountCode: c.accum,
        deprExpenseAccountCode: c.exp,
      },
      create: {
        organizationId: org.id,
        code: c.code,
        name: c.name,
        depreciationMethod: 'straight_line',
        defaultUsefulLife: c.life,
        ppeAccountCode: c.ppe,
        accumDeprAccountCode: c.accum,
        deprExpenseAccountCode: c.exp,
      },
    });
    catId.set(c.code, rec.id);
  }

  // Locations
  const locId = new Map<string, string>();
  for (const l of LOCS) {
    const rec = await prisma.location.upsert({
      where: { organizationId_code: { organizationId: org.id, code: l.code } },
      update: { name: l.name },
      create: {
        organizationId: org.id,
        code: l.code,
        name: l.name,
        city: 'Siquijor',
        region: 'Region VII',
      },
    });
    locId.set(l.code, rec.id);
  }

  // PPE inventory items (one per distinct asset type)
  const itemNames = [...new Set(LINES.map((l) => l.item))];
  const itemId = new Map<string, string>();
  for (let i = 0; i < itemNames.length; i++) {
    const name = itemNames[i]!;
    const line = LINES.find((l) => l.item === name)!;
    const itemCode = `PPE-${String(i + 1).padStart(3, '0')}`;
    const catName = CATS.find((c) => c.code === line.cat)?.name ?? null;
    const rec = await prisma.inventoryItem.upsert({
      where: { organizationId_itemCode: { organizationId: org.id, itemCode } },
      update: { description: name, unitCost: line.cost, category: catName },
      create: {
        organizationId: org.id,
        itemCode,
        description: name,
        unitOfMeasure: line.unit ?? 'unit',
        classification: 'ppe',
        category: catName,
        unitCost: line.cost,
      },
    });
    itemId.set(name, rec.id);
  }

  // Rebuild property records
  await prisma.propertyRecord.deleteMany({ where: { organizationId: org.id } });

  const catSeq = new Map<string, number>();
  let created = 0;
  let grossTotal = 0;
  let accumTotal = 0;

  for (const line of LINES) {
    const cat = CATS.find((c) => c.code === line.cat)!;
    const lifeMonths = cat.life * 12;
    for (let j = 0; j < line.count; j++) {
      const seq = (catSeq.get(cat.code) ?? 0) + 1;
      catSeq.set(cat.code, seq);
      const propertyNumber = `SBWD-${cat.code}-${String(seq).padStart(4, '0')}`;

      // Acquisition date: consecutive years from firstYear, capped at 2026 (≤ Aug).
      let acqYear = Math.min(2026, line.firstYear + j);
      let acqMonth = ((j * 3 + 2) % 12) + 1; // 1..12
      if (acqYear === 2026 && acqMonth > 7) acqMonth = ((j + 1) % 7) + 1; // keep before Aug 24
      const dateAcquired = new Date(Date.UTC(acqYear, acqMonth - 1, 10));

      // Cost with small ±3% deterministic variation.
      const cost = round2(Math.round((line.cost * (1 + ((seq % 7) - 3) / 100)) / 100) * 100);
      const salvage = round2(Math.round(cost * 0.05));
      const base = cost - salvage;
      const monthlyDep = round2(base / lifeMonths);
      const elapsed = Math.max(0, Math.min(lifeMonths, monthsBetween(dateAcquired, AS_OF)));
      const accum = round2(Math.min(base, monthlyDep * elapsed));
      const bookValue = round2(cost - accum);
      const condition =
        acqYear >= 2025 ? 'brand_new' : elapsed >= lifeMonths ? 'unserviceable' : 'serviceable';

      await prisma.propertyRecord.create({
        data: {
          organizationId: org.id,
          inventoryItemId: itemId.get(line.item)!,
          assetCategoryId: catId.get(line.cat)!,
          locationId: locId.get(line.loc)!,
          propertyNumber,
          serialNumber: `SN-${cat.code}${acqYear}${String(seq).padStart(3, '0')}`,
          description: `${line.item}${line.count > 1 ? ` (unit ${j + 1})` : ''}`,
          dateAcquired,
          acquisitionCost: cost,
          estimatedUsefulLife: cat.life,
          salvageValue: salvage,
          monthlyDepreciation: monthlyDep,
          accumulatedDepreciation: accum,
          bookValue,
          condition: condition as never,
          accountableUserId: custodianFor(line.loc),
          createdBy: uid('demo.admin'),
          updatedBy: uid('demo.admin'),
          createdAt: dateAcquired,
        },
      });
      created++;
      grossTotal += cost;
      accumTotal += accum;
    }
  }

  console.log(
    `Seeded fixed assets: ${CATS.length} categories, ${LOCS.length} locations, ${itemNames.length} PPE items, ` +
      `${created} property records. Gross cost ₱${Math.round(grossTotal).toLocaleString()}, ` +
      `accumulated depreciation ₱${Math.round(accumTotal).toLocaleString()}, ` +
      `net book value ₱${Math.round(grossTotal - accumTotal).toLocaleString()}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
