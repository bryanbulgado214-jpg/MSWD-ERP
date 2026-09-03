// jev.service.spec.ts — INTEGRATION TESTS.
//
// Requires a real PostgreSQL connection via Prisma Client. The JEV engine
// runs its writes inside `$transaction` (runAudited) and relies on real
// document-sequence rows, accounting-period lookups and DB-level defaults
// (numeric(18,2) money columns, uuid generation), none of which can be
// meaningfully mocked. Point DATABASE_URL at a disposable test database
// before running — never the dev or production database.
//
// Modeled on the budgeting integration specs (reservation.service.spec.ts):
// `new PrismaClient()` + `new JevService(prisma as unknown as PrismaService)`,
// the seeded MSWD organization, and cleanup of everything created in afterAll.

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';

import { JevService } from './jev.service';

const prisma = new PrismaClient();
const service = new JevService(
  prisma as unknown as PrismaService,
  {
    notifyUsersWithPermission: async () => undefined,
  } as never,
);

let organizationId: string;
let creatorId: string;
let posterId: string;
let debitAccountId: string; // asset, debit-normal
let creditAccountId: string; // revenue, credit-normal

// Any date inside an open FY period. The seed opens all 12 months of the
// current fiscal year, so "today" (this project's clock is 2026) is open.
const jevDate = '2026-08-12';

// Track every JEV this suite creates so afterAll can remove them and the
// suite stays re-runnable.
const createdJevIds = new Set<string>();
function track<T extends { id: string }>(jev: T): T {
  createdJevIds.add(jev.id);
  return jev;
}

beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = org.id;

  // Two DIFFERENT seeded users — creator vs poster. Any two distinct ids
  // work at the service layer (the permission guard is not involved here);
  // the point is exercising separation-of-duties on createdBy vs userId.
  const users = await prisma.user.findMany({
    where: { organizationId },
    take: 2,
    orderBy: { username: 'asc' },
  });
  if (users.length < 2) throw new Error('Seed must provide at least two users for the MSWD org.');
  creatorId = users[0]!.id;
  posterId = users[1]!.id;
  expect(creatorId).not.toBe(posterId);

  // A postable debit-normal (asset) and credit-normal (revenue) account.
  const debit = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      normalBalance: 'debit',
      accountType: 'asset',
    },
    orderBy: { accountCode: 'asc' },
  });
  const credit = await prisma.chartOfAccount.findFirstOrThrow({
    where: {
      organizationId,
      isHeader: false,
      isActive: true,
      normalBalance: 'credit',
      accountType: 'revenue',
    },
    orderBy: { accountCode: 'asc' },
  });
  debitAccountId = debit.id;
  creditAccountId = credit.id;
});

afterAll(async () => {
  const ids = [...createdJevIds];
  if (ids.length) {
    // Break the reversal self-linkage first so deletes never trip the FK.
    await prisma.journalEntryVoucher
      .updateMany({ where: { id: { in: ids } }, data: { reversalOfId: null } })
      .catch(() => {});
    await prisma.jevLine.deleteMany({ where: { jevId: { in: ids } } }).catch(() => {});
    await prisma.journalEntryVoucher.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  await prisma.$disconnect();
});

function balancedLines(amount: number) {
  return [
    {
      chartOfAccountId: debitAccountId,
      debitAmount: amount,
      creditAmount: 0,
      description: 'debit side',
    },
    {
      chartOfAccountId: creditAccountId,
      debitAmount: 0,
      creditAmount: amount,
      description: 'credit side',
    },
  ];
}

async function createDraft(amount: number, particulars = 'Test balanced entry') {
  return track(
    await service.create(organizationId, creatorId, {
      jevDate,
      particulars,
      lines: balancedLines(amount),
    }),
  );
}

async function makePostedJev(amount: number) {
  const draft = await createDraft(amount);
  const submitted = await service.submit(organizationId, draft.id, creatorId, draft.version);
  return service.post(organizationId, submitted.id, posterId, submitted.version);
}

describe('JevService lifecycle & controls', () => {
  it('creates a balanced JEV (draft), submits it, and posts it via a DIFFERENT user', async () => {
    const draft = await createDraft(1000, 'Balanced create/submit/post');
    expect(draft.status).toBe('draft');
    expect(Number(draft.totalDebit)).toBe(1000);
    expect(Number(draft.totalCredit)).toBe(1000);
    expect(draft.createdBy).toBe(creatorId);

    const submitted = await service.submit(organizationId, draft.id, creatorId, draft.version);
    expect(submitted.status).toBe('for_review');

    const posted = await service.post(organizationId, submitted.id, posterId, submitted.version);
    expect(posted.status).toBe('posted');
    expect(posted.poster?.id).toBe(posterId);
  });

  it('rejects creating an UNBALANCED JEV (BadRequestException)', async () => {
    await expect(
      service.create(organizationId, creatorId, {
        jevDate,
        particulars: 'Unbalanced',
        lines: [
          { chartOfAccountId: debitAccountId, debitAmount: 1000, creditAmount: 0 },
          { chartOfAccountId: creditAccountId, debitAmount: 0, creditAmount: 900 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a line that carries both a debit and a credit amount (BadRequestException)', async () => {
    await expect(
      service.create(organizationId, creatorId, {
        jevDate,
        particulars: 'Line with both sides',
        lines: [
          { chartOfAccountId: debitAccountId, debitAmount: 500, creditAmount: 500 },
          { chartOfAccountId: creditAccountId, debitAmount: 0, creditAmount: 500 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not allow editing a POSTED JEV (only draft is editable) and exposes no delete path', async () => {
    const posted = await makePostedJev(500);

    await expect(
      service.update(organizationId, posted.id, creatorId, {
        expectedVersion: posted.version,
        particulars: 'tampered after posting',
      }),
    ).rejects.toThrow(/Only draft/);

    // The service surface exposes no destructive delete method at all.
    expect((service as any).delete).toBeUndefined();
    expect((service as any).remove).toBeUndefined();
    expect((service as any).destroy).toBeUndefined();

    // Posted entry is unchanged and remains posted.
    const reloaded = await service.findOne(organizationId, posted.id);
    expect(reloaded.status).toBe('posted');
    expect(reloaded.particulars).not.toBe('tampered after posting');
  });

  it('enforces SEPARATION OF DUTIES: the preparer cannot post their own JEV, a different user can', async () => {
    const draft = await createDraft(750, 'Separation of duties');
    const submitted = await service.submit(organizationId, draft.id, creatorId, draft.version);

    // Same user who created it tries to post → Forbidden.
    await expect(
      service.post(organizationId, submitted.id, creatorId, submitted.version),
    ).rejects.toThrow(ForbiddenException);

    // Rejected attempt left the JEV untouched (still under review).
    const stillReview = await service.findOne(organizationId, submitted.id);
    expect(stillReview.status).toBe('for_review');
    expect(stillReview.version).toBe(submitted.version);

    // A DIFFERENT user posts it successfully.
    const posted = await service.post(organizationId, submitted.id, posterId, submitted.version);
    expect(posted.status).toBe('posted');
  });

  it('REVERSAL produces the exact opposite entry, links back to the original, and marks it reversed', async () => {
    const posted = await makePostedJev(1200);

    const reversal = track(
      await service.reverse(organizationId, posted.id, posterId, {
        expectedVersion: posted.version,
        reversalDate: jevDate,
        reason: 'correcting error',
      }),
    );

    // A new POSTED entry, linked to the original, with totals swapped.
    expect(reversal.id).not.toBe(posted.id);
    expect(reversal.status).toBe('posted');
    expect(reversal.reversalOfId).toBe(posted.id);
    expect(Number(reversal.totalDebit)).toBe(Number(posted.totalCredit));
    expect(Number(reversal.totalCredit)).toBe(Number(posted.totalDebit));

    // Each reversal line is the original line with debit/credit swapped.
    expect(reversal.lines).toHaveLength(posted.lines.length);
    for (const rLine of reversal.lines) {
      const original = posted.lines.find((o) => o.chartOfAccount.id === rLine.chartOfAccount.id);
      expect(original).toBeDefined();
      expect(Number(rLine.debitAmount)).toBe(Number(original!.creditAmount));
      expect(Number(rLine.creditAmount)).toBe(Number(original!.debitAmount));
    }

    // The original is now 'reversed'.
    const reloadedOriginal = await service.findOne(organizationId, posted.id);
    expect(reloadedOriginal.status).toBe('reversed');

    // Reversing an ALREADY-reversed JEV is rejected.
    await expect(
      service.reverse(organizationId, posted.id, posterId, {
        expectedVersion: reloadedOriginal.version,
        reversalDate: jevDate,
      }),
    ).rejects.toThrow(BadRequestException);

    // Reversing a NON-posted (draft) JEV is rejected.
    const draft = await createDraft(300, 'Draft that cannot be reversed');
    await expect(
      service.reverse(organizationId, draft.id, posterId, {
        expectedVersion: draft.version,
        reversalDate: jevDate,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('scopes findOne() and reverse() to the organization (NotFoundException for another org id)', async () => {
    const posted = await makePostedJev(400);
    const otherOrgId = '00000000-0000-0000-0000-000000000000';

    await expect(service.findOne(otherOrgId, posted.id)).rejects.toThrow(NotFoundException);
    await expect(
      service.reverse(otherOrgId, posted.id, posterId, {
        expectedVersion: posted.version,
        reversalDate: jevDate,
      }),
    ).rejects.toThrow(NotFoundException);

    // Reachable and still posted under the correct org — the cross-org
    // calls did not mutate it.
    const ok = await service.findOne(organizationId, posted.id);
    expect(ok.status).toBe('posted');
  });
});
