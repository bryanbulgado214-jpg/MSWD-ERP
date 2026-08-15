// check.service.spec.ts — INTEGRATION TESTS (real Prisma / test database).
//
// Verifies the cashier/GM segregation-of-duties on checks:
//   • printCheck records the printer (printedBy)
//   • voidCheck (approver action) rejects maker == checker — the person who
//     prepared, printed, or released a check cannot void it
//   • a different approver may void
// Point DATABASE_URL at a disposable test DB before running.

import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';

import { CheckService } from './check.service';

const prisma = new PrismaClient();
const service = new CheckService(prisma as unknown as PrismaService);

let organizationId: string;
let bankAccountId: string;
let userA: string; // preparer/creator
let userB: string; // printer
let userC: string; // independent approver

const createdCheckIds = new Set<string>();

async function makeCheck(
  status: 'pending' | 'printed',
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; version: number }> {
  const check = await prisma.check.create({
    data: {
      organizationId,
      bankAccountId,
      checkNumber:
        status === 'pending' ? null : `TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      amount: 1000,
      checkDate: new Date(),
      payeeName: 'SoD Test Payee',
      status,
      createdBy: userA,
      ...overrides,
    },
    select: { id: true, version: true },
  });
  createdCheckIds.add(check.id);
  return check;
}

beforeAll(async () => {
  const ba = await prisma.bankAccount.findFirst({ select: { id: true, organizationId: true } });
  if (!ba) throw new Error('Seed must provide at least one bank account.');
  bankAccountId = ba.id;
  organizationId = ba.organizationId;

  const users = await prisma.user.findMany({
    where: { organizationId },
    take: 3,
    orderBy: { username: 'asc' },
  });
  if (users.length < 3) throw new Error('Seed must provide at least three users for the org.');
  [userA, userB, userC] = [users[0]!.id, users[1]!.id, users[2]!.id];
});

afterAll(async () => {
  for (const id of createdCheckIds) {
    await prisma.checkStatusHistory.deleteMany({ where: { checkId: id } });
    await prisma.check.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe('CheckService.printCheck', () => {
  it('records the printer (printedBy) and marks the check printed', async () => {
    const c = await makeCheck('pending');
    const printed = await service.printCheck(organizationId, userB, c.id, {
      checkNumber: `PRN-${Date.now()}`,
    });
    expect(printed.status).toBe('printed');
    const row = await prisma.check.findUniqueOrThrow({
      where: { id: c.id },
      select: { printedBy: true },
    });
    expect(row.printedBy).toBe(userB);
  });
});

describe('CheckService.voidCheck — maker != checker', () => {
  it('rejects the user who PRINTED the check', async () => {
    const c = await makeCheck('printed', { printedBy: userB });
    await expect(
      service.voidCheck(organizationId, userB, c.id, {
        expectedVersion: c.version,
        toStatus: 'voided',
        remarks: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects the user who PREPARED (created) the check', async () => {
    const c = await makeCheck('printed', { printedBy: userB });
    await expect(
      service.voidCheck(organizationId, userA, c.id, {
        expectedVersion: c.version,
        toStatus: 'voided',
        remarks: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects the user who RELEASED the check', async () => {
    const c = await makeCheck('printed', { printedBy: userB, releasedBy: userC });
    await expect(
      service.voidCheck(organizationId, userC, c.id, {
        expectedVersion: c.version,
        toStatus: 'voided',
        remarks: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an independent approver to void', async () => {
    const c = await makeCheck('printed', { printedBy: userB }); // created by A, printed by B
    const voided = await service.voidCheck(organizationId, userC, c.id, {
      expectedVersion: c.version,
      toStatus: 'voided',
      remarks: 'Spoiled in printer',
    });
    expect(voided.status).toBe('voided');
  });
});
