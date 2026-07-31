// reservation.service.spec.ts — INTEGRATION TESTS.
//
// Requires a real PostgreSQL connection — ReservationService's submit/
// reject/cancel paths use `$transaction` with `SELECT ... FOR UPDATE`,
// which cannot be meaningfully mocked (the whole point is real
// row-locking behavior). Point DATABASE_URL at a disposable test
// database before running.
//
// Concurrency-specific behavior (two simultaneous submits racing for
// the same release) is covered separately in
// reservation-concurrency.spec.ts — this file covers the lifecycle's
// correctness (each action's effect and validation), not races.

import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ReservationService } from './reservation.service';

const prisma = new PrismaClient();
const service = new ReservationService(prisma as unknown as PrismaService);
const runId = Date.now().toString(36);

let organizationId: string;
let budgetHeaderId: string;

beforeAll(async () => {
  const organization = await prisma.organization.findFirstOrThrow();
  organizationId = organization.id;
  const header = await prisma.budgetHeader.findFirstOrThrow({ where: { organizationId } });
  budgetHeaderId = header.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeReleasedRelease(releasedAmount: number, suffix: string) {
  return prisma.budgetRelease.create({
    data: {
      organizationId,
      budgetHeaderId,
      releaseNumber: `RT-${suffix}-${runId}`.slice(0, 30),
      releaseDate: new Date(),
      releasedAmount,
      status: 'released',
    },
  });
}

describe('ReservationService lifecycle', () => {
  it('createDraft does not touch the release balance at all', async () => {
    const release = await makeReleasedRelease(50_000, 'CREATE');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 40_000 });

    expect(reservation.status).toBe('draft');
    const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00'); // untouched

    await prisma.budgetReservation.delete({ where: { id: reservation.id } });
    await prisma.budgetRelease.delete({ where: { id: release.id } });
  });

  it('editDraft updates the amount while still draft, and rejects once no longer draft', async () => {
    const release = await makeReleasedRelease(50_000, 'EDIT');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 10_000 });

    const edited = await service.editDraft(organizationId, reservation.id, reservation.version, { reservationAmount: 15_000 });
    expect(edited.reservationAmount.toFixed(2)).toBe('15000.00');
    expect(edited.version).toBe(reservation.version + 1);

    const submitted = await service.submit(organizationId, edited.id, edited.version);
    await expect(
      service.editDraft(organizationId, submitted.id, submitted.version, { reservationAmount: 999 }),
    ).rejects.toThrow(/cannot be edited/);

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetReservation.delete({ where: { id: reservation.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('submit commits the amount against the release and logs a ledger entry', async () => {
    const release = await makeReleasedRelease(50_000, 'SUBMIT');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 20_000 });

    const submitted = await service.submit(organizationId, reservation.id, reservation.version);
    expect(submitted.status).toBe('submitted');

    const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('20000.00');

    const ledgerEntry = await prisma.budgetTransactionLog.findFirst({
      where: { budgetReservationId: reservation.id, transactionType: 'reservation' },
    });
    expect(ledgerEntry).not.toBeNull();
    expect(ledgerEntry?.signedAmount.toFixed(2)).toBe('20000.00');

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetReservation.delete({ where: { id: reservation.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('submit rejects when the request exceeds available budget', async () => {
    const release = await makeReleasedRelease(10_000, 'OVERBUDGET');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 15_000 });

    await expect(service.submit(organizationId, reservation.id, reservation.version)).rejects.toThrow(/Insufficient budget/);

    await prisma.budgetReservation.delete({ where: { id: reservation.id } });
    await prisma.budgetRelease.delete({ where: { id: release.id } });
  });

  it('rejects creating a draft reservation against a release not yet in "released" status', async () => {
    const draftRelease = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `RT-DRAFTREL-${runId}`.slice(0, 30),
        releaseDate: new Date(),
        releasedAmount: 50_000,
        status: 'draft',
      },
    });

    await expect(
      service.createDraft(organizationId, { budgetReleaseId: draftRelease.id, reservationAmount: 10_000 }),
    ).rejects.toThrow(/must be in "released" status/);

    await prisma.budgetRelease.delete({ where: { id: draftRelease.id } });
  });

  it('approve moves a submitted reservation to approved without touching the release balance again', async () => {
    const release = await makeReleasedRelease(30_000, 'APPROVE');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 10_000 });
    const submitted = await service.submit(organizationId, reservation.id, reservation.version);

    const approved = await service.approve(organizationId, submitted.id, submitted.version);
    expect(approved.status).toBe('approved');

    const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('10000.00'); // unchanged from submit

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetReservation.delete({ where: { id: reservation.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('reject releases the held amount back to the release', async () => {
    const release = await makeReleasedRelease(30_000, 'REJECT');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 12_000 });
    const submitted = await service.submit(organizationId, reservation.id, reservation.version);

    const rejected = await service.reject(organizationId, submitted.id, submitted.version, undefined, 'Not needed after all.');
    expect(rejected.status).toBe('rejected');

    const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00'); // released back

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetReservation.delete({ where: { id: reservation.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('cancel from draft is a no-op on the release balance (nothing was ever held)', async () => {
    const release = await makeReleasedRelease(30_000, 'CANCELDRAFT');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 8_000 });

    const cancelled = await service.cancel(organizationId, reservation.id, reservation.version);
    expect(cancelled.status).toBe('cancelled');

    const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');

    await prisma.budgetReservation.delete({ where: { id: reservation.id } });
    await prisma.budgetRelease.delete({ where: { id: release.id } });
  });

  it('cancel from approved releases the held amount, same as reject', async () => {
    const release = await makeReleasedRelease(30_000, 'CANCELAPPROVED');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 9_000 });
    const submitted = await service.submit(organizationId, reservation.id, reservation.version);
    const approved = await service.approve(organizationId, submitted.id, submitted.version);

    const cancelled = await service.cancel(organizationId, approved.id, approved.version);
    expect(cancelled.status).toBe('cancelled');

    const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetReservation.delete({ where: { id: reservation.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('rejects any action with a stale version (optimistic concurrency)', async () => {
    const release = await makeReleasedRelease(30_000, 'STALEVERSION');
    const reservation = await service.createDraft(organizationId, { budgetReleaseId: release.id, reservationAmount: 5_000 });

    await expect(service.submit(organizationId, reservation.id, reservation.version + 1)).rejects.toThrow();

    await prisma.budgetReservation.delete({ where: { id: reservation.id } });
    await prisma.budgetRelease.delete({ where: { id: release.id } });
  });
});
