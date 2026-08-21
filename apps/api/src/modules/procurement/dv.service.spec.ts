// dv.service.spec.ts — INTEGRATION TESTS (real PostgreSQL via Prisma).
//
// Exercises the disbursement → GL integration:
//  1. Releasing a DV with free-form deductions posts a balanced JEV that credits
//     each deduction to its OWN account (retention is not folded into cash).
//  2. A missing required posting-account mapping BLOCKS the release (loud
//     failure, transaction rolled back) instead of disbursing with no entry.
//  3. listUnposted surfaces released DVs that never produced a posted JEV.
//
// Point DATABASE_URL at a disposable seeded database before running — never the
// dev or production database. Modeled on jev.service.spec.ts.

import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';

import { DvService } from './dv.service';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);
const service = new DvService(prisma as unknown as PrismaService, autoJev);

let organizationId: string;
let userId: string;
let apAccountId: string;
let cashAccountId: string;
let birAccountId: string;
let retentionAccountId: string;
let cashMappingCoaId: string; // restored after the loud-failure test
let fundSourceId: string | null = null;
let responsibilityCenterId: string | null = null;

const createdDvIds = new Set<string>();
let dvSeq = 0;

async function resolveMapping(mappingKey: string): Promise<string | null> {
  const m = await prisma.accountMapping.findFirst({
    where: { organizationId, mappingKey, isActive: true },
    select: { chartOfAccountId: true },
  });
  return m?.chartOfAccountId ?? null;
}

async function seedApprovedDv(opts: {
  tax: number;
  deductions: Array<{ label: string; chartOfAccountId: string; amount: number }>;
  status?: 'approved' | 'released';
}) {
  dvSeq += 1;
  const gross = 100000;
  const deductionsTotal = opts.deductions.reduce((s, d) => s + d.amount, 0);
  const net = gross - opts.tax - deductionsTotal;
  const released = opts.status === 'released';
  const dv = await prisma.disbursementVoucher.create({
    data: {
      organizationId,
      dvNumber: `DV-TEST-${Date.now()}-${dvSeq}`,
      dvDate: new Date('2026-08-12'),
      dvType: 'procurement',
      payeeName: 'Integration test payee',
      particulars: 'Integration test disbursement',
      paymentMode: 'check',
      grossAmount: gross,
      taxAmount: opts.tax,
      otherDeductions: deductionsTotal,
      netAmount: net,
      status: opts.status ?? 'approved',
      ...(released ? { releasedBy: userId, releasedAt: new Date('2026-08-12') } : {}),
      ...(fundSourceId ? { fundSourceId } : {}),
      ...(responsibilityCenterId ? { responsibilityCenterId } : {}),
      createdBy: userId,
      updatedBy: userId,
      version: 1,
      deductions: {
        create: opts.deductions.map((d, i) => ({
          label: d.label,
          chartOfAccountId: d.chartOfAccountId,
          amount: d.amount,
          sortOrder: i,
        })),
      },
    },
    select: { id: true, version: true },
  });
  createdDvIds.add(dv.id);
  return dv;
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  const user = await prisma.user.findFirstOrThrow({ where: { organizationId } });
  userId = user.id;

  const ap = await resolveMapping('ap.accounts_payable');
  const cash = await resolveMapping('cash.in_bank');
  const bir = await resolveMapping('ap.due_to_bir');
  if (!ap || !cash || !bir) {
    throw new Error(
      'Seed must configure ap.accounts_payable, cash.in_bank and ap.due_to_bir posting-account mappings.',
    );
  }
  apAccountId = ap;
  cashAccountId = cash;
  birAccountId = bir;
  cashMappingCoaId = cash;

  // A distinct liability account for the retention deduction line.
  const retention = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      id: { notIn: [apAccountId, birAccountId, cashAccountId] },
      OR: [
        { name: { contains: 'Guaranty', mode: 'insensitive' } },
        { name: { contains: 'Retention', mode: 'insensitive' } },
        { name: { contains: 'Other Payables', mode: 'insensitive' } },
      ],
    },
    orderBy: { accountCode: 'asc' },
  });
  retentionAccountId = retention.id;

  const fund = await prisma.fundSource.findFirst({
    where: { organizationId },
    select: { id: true },
  });
  const rc = await prisma.responsibilityCenter.findFirst({
    where: { organizationId },
    select: { id: true },
  });
  fundSourceId = fund?.id ?? null;
  responsibilityCenterId = rc?.id ?? null;
});

afterAll(async () => {
  // Restore the cash mapping even if a test threw before restoring it.
  if (cashMappingCoaId) {
    await prisma.accountMapping
      .upsert({
        where: { organizationId_mappingKey: { organizationId, mappingKey: 'cash.in_bank' } },
        update: { chartOfAccountId: cashMappingCoaId },
        create: {
          organizationId,
          mappingKey: 'cash.in_bank',
          chartOfAccountId: cashMappingCoaId,
          createdBy: userId,
          updatedBy: userId,
        },
      })
      .catch(() => {});
  }
  const ids = [...createdDvIds];
  if (ids.length) {
    const jevs = await prisma.journalEntryVoucher.findMany({
      where: { sourceTable: 'disbursement_vouchers', sourceId: { in: ids } },
      select: { id: true },
    });
    const jevIds = jevs.map((j) => j.id);
    await prisma.jevLine.deleteMany({ where: { jevId: { in: jevIds } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevIds } } }).catch(() => {});
    await prisma.dvDeduction.deleteMany({ where: { dvId: { in: ids } } }).catch(() => {});
    await prisma.disbursementVoucher.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('DvService release → auto-JEV', () => {
  it('posts a balanced JEV crediting each deduction to its own account', async () => {
    const dv = await seedApprovedDv({
      tax: 2000,
      deductions: [{ label: 'Retention 10%', chartOfAccountId: retentionAccountId, amount: 10000 }],
    });

    await service.release(organizationId, dv.id, dv.version, userId);

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'disbursement_vouchers', sourceId: dv.id },
      include: { lines: true },
    });

    expect(jev.status).toBe('posted');
    const totalDebit = jev.lines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const totalCredit = jev.lines.reduce((s, l) => s + Number(l.creditAmount), 0);
    expect(totalDebit).toBeCloseTo(100000, 2);
    expect(totalCredit).toBeCloseTo(100000, 2);

    const debitOf = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const creditOf = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);

    expect(debitOf(apAccountId)).toBeCloseTo(100000, 2); // A/P debited gross
    expect(creditOf(birAccountId)).toBeCloseTo(2000, 2); // Due to BIR
    expect(creditOf(retentionAccountId)).toBeCloseTo(10000, 2); // retention to its OWN account
    expect(creditOf(cashAccountId)).toBeCloseTo(88000, 2); // cash = net only
  });

  it('blocks release when a required posting account is unmapped, leaving the DV approved', async () => {
    const dv = await seedApprovedDv({ tax: 0, deductions: [] });

    await prisma.accountMapping.delete({
      where: { organizationId_mappingKey: { organizationId, mappingKey: 'cash.in_bank' } },
    });
    try {
      await expect(
        service.release(organizationId, dv.id, dv.version, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      await prisma.accountMapping.upsert({
        where: { organizationId_mappingKey: { organizationId, mappingKey: 'cash.in_bank' } },
        update: { chartOfAccountId: cashMappingCoaId },
        create: {
          organizationId,
          mappingKey: 'cash.in_bank',
          chartOfAccountId: cashMappingCoaId,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }

    const after = await prisma.disbursementVoucher.findUniqueOrThrow({
      where: { id: dv.id },
      select: { status: true },
    });
    expect(after.status).toBe('approved'); // rolled back — never released
    const jevCount = await prisma.journalEntryVoucher.count({
      where: { sourceTable: 'disbursement_vouchers', sourceId: dv.id },
    });
    expect(jevCount).toBe(0); // no silent journal entry
  });

  it('listUnposted surfaces a released DV with no posted JEV', async () => {
    const dv = await seedApprovedDv({ tax: 0, deductions: [], status: 'released' });
    const unposted = await service.listUnposted(organizationId);
    expect(unposted.some((u) => u.id === dv.id)).toBe(true);
  });
});
