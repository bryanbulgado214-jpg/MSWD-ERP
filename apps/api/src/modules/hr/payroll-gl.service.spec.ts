// payroll-gl.service.spec.ts — INTEGRATION TESTS (real PostgreSQL).
//
// Exercises the payroll → GL posting: on pay, Dr Salaries & Wages (gross net of
// late/undertime/absent), Cr each statutory deduction to its own payable
// (Due to BIR / GSIS / ...), Cr Net Pay Payable. Balances by construction.
//
// Point DATABASE_URL at a disposable seeded database. Seeds a minimal payroll
// run + item + deduction details and self-cleans.

import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const prisma = new PrismaClient();
const autoJev = new AutoJevService(prisma as unknown as PrismaService);

const EMP_NUMBER = 'TEST-PR-EMP-1';
const PERIOD_NAME = 'TEST PR Period';
const RUN_NUMBER = 'TEST-PR-RUN-1';

const GROSS = 10000;
const BIR = 500;
const GSIS = 900;
const LATE = 100;
const DEDUCTIONS = BIR + GSIS + LATE; // 1500
const NET = GROSS - DEDUCTIONS; // 8500

let organizationId: string;
let userId: string;
let salaryExpenseId: string;
let birId: string;
let gsisId: string;
let netPayableId: string;
let runId: string;
let payDate: Date;

async function resolveMapping(mappingKey: string): Promise<string> {
  const m = await prisma.accountMapping.findFirstOrThrow({
    where: { organizationId, mappingKey, isActive: true },
    select: { chartOfAccountId: true },
  });
  return m.chartOfAccountId;
}

async function cleanupFixtures() {
  const run = await prisma.payrollRun.findFirst({
    where: { organizationId, runNumber: RUN_NUMBER },
    select: { id: true },
  });
  if (run) {
    const jevs = await prisma.journalEntryVoucher.findMany({
      where: { sourceTable: 'payroll_runs', sourceId: run.id },
      select: { id: true },
    });
    const jevIds = jevs.map((j) => j.id);
    await prisma.jevLine.deleteMany({ where: { jevId: { in: jevIds } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: jevIds } } }).catch(() => {});
    await prisma.payrollItemDetail
      .deleteMany({ where: { payrollItem: { payrollRunId: run.id } } })
      .catch(() => {});
    await prisma.payrollItem.deleteMany({ where: { payrollRunId: run.id } }).catch(() => {});
    await prisma.payrollRun.delete({ where: { id: run.id } }).catch(() => {});
  }
  await prisma.payrollPeriod
    .deleteMany({ where: { organizationId, name: PERIOD_NAME } })
    .catch(() => {});
  await prisma.employee
    .deleteMany({ where: { organizationId, employeeNumber: EMP_NUMBER } })
    .catch(() => {});
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { organizationId } })).id;

  salaryExpenseId = await resolveMapping('payroll.salaries_expense');
  birId = await resolveMapping('payroll.due_bir');
  gsisId = await resolveMapping('payroll.due_gsis');
  netPayableId = await resolveMapping('payroll.net_payable');

  await cleanupFixtures();

  const employee = await prisma.employee.create({
    data: { organizationId, employeeNumber: EMP_NUMBER, firstName: 'Test', lastName: 'Employee' },
    select: { id: true },
  });
  payDate = new Date('2026-08-15');
  const period = await prisma.payrollPeriod.create({
    data: {
      organizationId,
      name: PERIOD_NAME,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-15'),
      payDate,
      createdBy: userId,
    },
    select: { id: true },
  });
  const run = await prisma.payrollRun.create({
    data: {
      organizationId,
      payrollPeriodId: period.id,
      runNumber: RUN_NUMBER,
      status: 'approved',
      totalGross: GROSS,
      totalDeductions: DEDUCTIONS,
      totalNet: NET,
      employeeCount: 1,
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true },
  });
  runId = run.id;
  const item = await prisma.payrollItem.create({
    data: {
      organizationId,
      payrollRunId: runId,
      employeeId: employee.id,
      basicPay: GROSS,
      grossPay: GROSS,
      totalDeductions: DEDUCTIONS,
      netPay: NET,
      details: {
        createMany: {
          data: [
            {
              detailType: 'deduction',
              referenceCode: 'BIR',
              referenceName: 'Withholding Tax',
              amount: BIR,
            },
            {
              detailType: 'deduction',
              referenceCode: 'GSIS',
              referenceName: 'GSIS Premium',
              amount: GSIS,
            },
            {
              detailType: 'deduction',
              referenceCode: 'LATE',
              referenceName: 'Late Deduction',
              amount: LATE,
            },
          ],
        },
      },
    },
    select: { id: true },
  });
  void item;
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('Payroll → GL', () => {
  it('posts salaries net of tardiness with each statutory deduction to its own payable', async () => {
    await runAudited(prisma, userId, (tx) =>
      autoJev.onPayrollPaid(tx, organizationId, userId, {
        id: runId,
        runNumber: RUN_NUMBER,
        payDate,
        totalGross: GROSS,
        totalNet: NET,
      }),
    );

    const jev = await prisma.journalEntryVoucher.findFirstOrThrow({
      where: { organizationId, sourceTable: 'payroll_runs', sourceId: runId },
      include: { lines: true },
    });
    expect(jev.status).toBe('posted');
    const debit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.debitAmount ?? 0);
    const credit = (acc: string) =>
      Number(jev.lines.find((l) => l.chartOfAccountId === acc)?.creditAmount ?? 0);

    expect(debit(salaryExpenseId)).toBeCloseTo(GROSS - LATE, 2); // 9900 (net of LATE)
    expect(credit(birId)).toBeCloseTo(BIR, 2);
    expect(credit(gsisId)).toBeCloseTo(GSIS, 2);
    expect(credit(netPayableId)).toBeCloseTo(NET, 2);

    const td = jev.lines.reduce((s, l) => s + Number(l.debitAmount), 0);
    const tc = jev.lines.reduce((s, l) => s + Number(l.creditAmount), 0);
    expect(td).toBeCloseTo(tc, 2);
  });
});
