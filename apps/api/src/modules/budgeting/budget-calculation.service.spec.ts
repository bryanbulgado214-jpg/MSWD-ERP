// budget-calculation.service.spec.ts — INTEGRATION TESTS.
//
// Requires a real PostgreSQL connection via Prisma Client — unlike
// budget-validation.spec.ts, BudgetCalculationService genuinely queries
// the database (aggregations, joins), so there is no mock-based
// shortcut here. Point DATABASE_URL at a disposable test database
// before running — never the dev or production database.

import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { BudgetCalculationService } from './budget-calculation.service';

const prisma = new PrismaClient();
const service = new BudgetCalculationService(prisma as unknown as PrismaService);

let organizationId: string;
let budgetHeaderId: string;
const runId = Date.now().toString(36);

beforeAll(async () => {
  const organization = await prisma.organization.findFirstOrThrow();
  organizationId = organization.id;
  const header = await prisma.budgetHeader.findFirstOrThrow({ where: { organizationId } });
  budgetHeaderId = header.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('BudgetCalculationService', () => {
  it('getReleaseSummary computes obligated from the ledger independently of reserved_amount, and available = released - obligated', async () => {
    const release = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `CALC-TEST-${runId}`,
        releaseDate: new Date(),
        releasedAmount: 100_000,
        reservedAmount: 30_000,
        status: 'released',
      },
    });
    // Ledger entries that sum to the SAME 30,000 as reservedAmount above
    // — proving isConsistent when they genuinely agree.
    await prisma.budgetTransactionLog.create({
      data: {
        organizationId,
        budgetReleaseId: release.id,
        transactionType: 'reservation',
        signedAmount: 30_000,
      },
    });

    const summary = await service.getReleaseSummary(organizationId, release.id);

    expect(summary.approvedAmount.toFixed(2)).toBe(
      (await prisma.budgetHeader.findUniqueOrThrow({ where: { id: budgetHeaderId } })).totalAmount.toFixed(2),
    );
    expect(summary.releasedAmount.toFixed(2)).toBe('100000.00');
    expect(summary.reservedAmount.toFixed(2)).toBe('30000.00');
    expect(summary.obligatedAmount.toFixed(2)).toBe('30000.00');
    expect(summary.availableAmount.toFixed(2)).toBe('70000.00'); // 100000 - 30000
    expect(summary.isConsistent).toBe(true);
    expect(summary.utilizedAmount.toFixed(2)).toBe('0.00'); // no data source yet, by design

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('flags isConsistent=false when reserved_amount and the ledger genuinely disagree', async () => {
    const release = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `CALC-TEST-DRIFT-${runId}`,
        releaseDate: new Date(),
        releasedAmount: 50_000,
        reservedAmount: 20_000, // release SAYS 20,000 is reserved...
        status: 'released',
      },
    });
    // ...but the ledger only records 15,000 worth of reservation activity.
    await prisma.budgetTransactionLog.create({
      data: {
        organizationId,
        budgetReleaseId: release.id,
        transactionType: 'reservation',
        signedAmount: 15_000,
      },
    });

    const summary = await service.getReleaseSummary(organizationId, release.id);
    expect(summary.isConsistent).toBe(false);
    expect(summary.reservedAmount.toFixed(2)).toBe('20000.00');
    expect(summary.obligatedAmount.toFixed(2)).toBe('15000.00');

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('getHeaderSummary aggregates across every release under the header', async () => {
    const releaseA = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `CALC-TEST-AGG-A-${runId}`,
        releaseDate: new Date(),
        releasedAmount: 60_000,
        status: 'released',
      },
    });
    const releaseB = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `CALC-TEST-AGG-B-${runId}`,
        releaseDate: new Date(),
        releasedAmount: 40_000,
        status: 'released',
      },
    });

    const summary = await service.getHeaderSummary(organizationId, budgetHeaderId);
    // At minimum these two new releases' totals must be reflected — the
    // header may have other releases too (from other tests/seed data),
    // so assert a lower bound rather than an exact total.
    expect(summary.releasedAmount.gte(100_000)).toBe(true);

    await prisma.budgetRelease.deleteMany({ where: { id: { in: [releaseA.id, releaseB.id] } } }).catch(() => {});
  });

  it('throws NotFoundException for a release that does not exist', async () => {
    await expect(service.getReleaseSummary(organizationId, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/);
  });

  // Regression test for the Budgeting Module Audit's critical finding:
  // both methods previously took no organizationId and queried by id
  // alone, so any organization could read any other organization's
  // summary data. Proves the fix — a genuinely different organization's
  // valid header/release id must now come back NotFoundException, not
  // that organization's real data.
  it('does not leak another organization\'s budget header summary (org isolation)', async () => {
    const otherOrg = await prisma.organization.create({ data: { code: `AUDIT-ORG-${runId}`, name: 'Audit Test Org' } });
    const otherUnit = await prisma.organizationalUnit.create({
      data: { organizationId: otherOrg.id, code: 'ROOT', name: 'Root', unitType: 'division' },
    });
    const otherRc = await prisma.responsibilityCenter.create({
      data: { organizationId: otherOrg.id, organizationalUnitId: otherUnit.id, code: 'AUDIT-RC', name: 'Audit RC' },
    });
    const otherFund = await prisma.fundSource.create({ data: { organizationId: otherOrg.id, code: 'AUDIT-FUND', name: 'Audit Fund' } });
    const otherFy = await prisma.fiscalYear.create({
      data: { organizationId: otherOrg.id, year: 2099, name: 'FY2099', startDate: new Date('2099-01-01'), endDate: new Date('2099-12-31') },
    });
    const otherCycle = await prisma.budgetCycle.create({ data: { organizationId: otherOrg.id, fiscalYearId: otherFy.id, code: 'AUDIT-CYCLE', name: 'Audit Cycle' } });
    const otherVersion = await prisma.budgetVersion.create({ data: { budgetCycleId: otherCycle.id, versionNumber: 1, name: 'Original' } });
    const otherHeader = await prisma.budgetHeader.create({
      data: {
        organizationId: otherOrg.id,
        budgetVersionId: otherVersion.id,
        responsibilityCenterId: otherRc.id,
        fundSourceId: otherFund.id,
        totalAmount: 9_999_999,
        status: 'approved',
      },
    });

    await expect(service.getHeaderSummary(organizationId, otherHeader.id)).rejects.toThrow(/not found/);

    await prisma.budgetHeader.delete({ where: { id: otherHeader.id } }).catch(() => {});
    await prisma.budgetVersion.delete({ where: { id: otherVersion.id } }).catch(() => {});
    await prisma.budgetCycle.delete({ where: { id: otherCycle.id } }).catch(() => {});
    await prisma.fiscalYear.delete({ where: { id: otherFy.id } }).catch(() => {});
    await prisma.fundSource.delete({ where: { id: otherFund.id } }).catch(() => {});
    await prisma.responsibilityCenter.delete({ where: { id: otherRc.id } }).catch(() => {});
    await prisma.organizationalUnit.delete({ where: { id: otherUnit.id } }).catch(() => {});
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => {});
  });
});
