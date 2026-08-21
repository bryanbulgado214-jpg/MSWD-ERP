// asset-gl.service.spec.ts — INTEGRATION TESTS (real PostgreSQL).
//
// Exercises the (now hardened) depreciation → GL posting:
//  1. A depreciation run posts a balanced JEV — Dr Depreciation Expense,
//     Cr Accumulated Depreciation, per category.
//  2. A category whose COA accounts don't exist BLOCKS the posting (loud
//     failure) rather than silently skipping the category.
//
// Point DATABASE_URL at a disposable seeded database. Drives onDepreciationPosted
// through runAudited with real COA account codes.

import { randomUUID } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);

let organizationId: string;
let userId: string;
let deprExpenseCode: string;
let deprExpenseId: string;
let accumDeprCode: string;
let accumDeprId: string;

const createdSourceIds = new Set<string>();

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { organizationId } })).id;

  const deprExpense = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      accountType: 'expense',
      name: { contains: 'Depreciation', mode: 'insensitive' },
      NOT: { name: { contains: 'Accumulated', mode: 'insensitive' } },
    },
    orderBy: { accountCode: 'asc' },
  });
  const accumDepr = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      name: { contains: 'Accumulated Depreciation', mode: 'insensitive' },
    },
    orderBy: { accountCode: 'asc' },
  });
  deprExpenseCode = deprExpense.accountCode;
  deprExpenseId = deprExpense.id;
  accumDeprCode = accumDepr.accountCode;
  accumDeprId = accumDepr.id;
});

afterAll(async () => {
  const ids = [...createdSourceIds];
  if (ids.length) {
    const jevs = await prisma.journalEntryVoucher.findMany({
      where: { sourceTable: 'depreciation_runs', sourceId: { in: ids } },
      select: { id: true },
    });
    const jevIds = jevs.map((j) => j.id);
    await prisma.jevLine.deleteMany({ where: { jevId: { in: jevIds } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevIds } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('Depreciation → GL', () => {
  it('posts a balanced JEV (Dr Depreciation Expense, Cr Accumulated Depreciation)', async () => {
    const runId = randomUUID();
    createdSourceIds.add(runId);
    await runAudited(prisma, userId, (tx) =>
      autoJev.onDepreciationPosted(tx, organizationId, userId, {
        id: runId,
        runNumber: 'TEST-DEP-1',
        periodMonth: 8,
        periodYear: 2026,
        categoryTotals: [
          {
            categoryName: 'Test Machinery',
            deprExpenseAccountCode: deprExpenseCode,
            accumDeprAccountCode: accumDeprCode,
            totalAmount: 1200,
          },
        ],
      }),
    );

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'depreciation_runs', sourceId: runId },
      include: { lines: true },
    });
    expect(jev.status).toBe('posted');
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);
    expect(debit(deprExpenseId)).toBeCloseTo(1200, 2);
    expect(credit(accumDeprId)).toBeCloseTo(1200, 2);
  });

  it('blocks posting when a category account does not exist', async () => {
    const runId = randomUUID();
    await expect(
      runAudited(prisma, userId, (tx) =>
        autoJev.onDepreciationPosted(tx, organizationId, userId, {
          id: runId,
          runNumber: 'TEST-DEP-2',
          periodMonth: 8,
          periodYear: 2026,
          categoryTotals: [
            {
              categoryName: 'Bad Category',
              deprExpenseAccountCode: 'ZZ-NONE-99',
              accumDeprAccountCode: accumDeprCode,
              totalAmount: 500,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const count = await prisma.journalEntryVoucher.count({
      where: { sourceTable: 'depreciation_runs', sourceId: runId },
    });
    expect(count).toBe(0);
  });
});
