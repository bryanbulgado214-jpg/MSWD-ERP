// reservation-concurrency.spec.ts
//
// Tests ONLY concurrent-reservation overspend protection — not the rest
// of the Reservation Service's lifecycle (that's covered separately).
// Runs against a real PostgreSQL database (never mocked): the entire
// point of this test is to prove the database-level row lock actually
// prevents two simultaneous submissions from over-committing the same
// budget release, which cannot be demonstrated with a mocked Prisma
// client — it's a genuine multi-connection concurrency property, not
// pure application logic.
//
// Point DATABASE_URL at a disposable test database before running —
// never the dev or production database, since this test inserts and
// deletes real rows. Run via: npm test --workspace=@mswd-erp/api

import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ReservationService } from './reservation.service';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const reservationService = new ReservationService(prismaService);

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

describe('Concurrent reservation protection', () => {
  it('allows exactly one of two simultaneous submits that together would overspend a release, and never lets reserved_amount exceed released_amount', async () => {
    // A release with 100,000 available, and two DRAFT reservations that
    // together (70,000 + 60,000 = 130,000) exceed it.
    const release = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `CT-${Date.now()}`.slice(0, 30),
        releaseDate: new Date(),
        releasedAmount: 100_000,
        status: 'released',
      },
    });

    const reservationA = await reservationService.createDraft(organizationId, {
      budgetReleaseId: release.id,
      reservationAmount: 70_000,
    });
    const reservationB = await reservationService.createDraft(organizationId, {
      budgetReleaseId: release.id,
      reservationAmount: 60_000,
    });

    // Genuinely concurrent — both promises start before either resolves.
    // The Prisma client's connection pool gives each $transaction call
    // its own DB connection, so this exercises a real two-connection
    // race, not a simulated one.
    const results = await Promise.allSettled([
      reservationService.submit(organizationId, reservationA.id, reservationA.version),
      reservationService.submit(organizationId, reservationB.id, reservationB.version),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    expect(finalRelease.reservedAmount.lte(finalRelease.releasedAmount)).toBe(true);
    // Exactly one reservation's worth (70,000 or 60,000) was committed —
    // never both, never neither.
    expect(['70000', '60000']).toContain(finalRelease.reservedAmount.toFixed(0));

    // Cleanup.
    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {
      // Expected to fail — budget_transaction_logs is append-only by
      // design (a DB trigger rejects the delete). Left in place
      // deliberately, same as production would behave.
    });
    await prisma.budgetReservation.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });

  it('rejects a double-submit of the SAME reservation attempted twice concurrently', async () => {
    const release = await prisma.budgetRelease.create({
      data: {
        organizationId,
        budgetHeaderId,
        releaseNumber: `CTD-${Date.now()}`.slice(0, 30),
        releaseDate: new Date(),
        releasedAmount: 50_000,
        status: 'released',
      },
    });

    const reservation = await reservationService.createDraft(organizationId, {
      budgetReleaseId: release.id,
      reservationAmount: 40_000,
    });

    const results = await Promise.allSettled([
      reservationService.submit(organizationId, reservation.id, reservation.version),
      reservationService.submit(organizationId, reservation.id, reservation.version),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const finalRelease = await prisma.budgetRelease.findUniqueOrThrow({ where: { id: release.id } });
    // Must be committed exactly ONCE (40,000), never twice (80,000).
    expect(finalRelease.reservedAmount.toFixed(0)).toBe('40000');

    await prisma.budgetTransactionLog.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetReservation.deleteMany({ where: { budgetReleaseId: release.id } }).catch(() => {});
    await prisma.budgetRelease.delete({ where: { id: release.id } }).catch(() => {});
  });
});
