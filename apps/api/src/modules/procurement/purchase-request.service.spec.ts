// purchase-request.service.spec.ts — INTEGRATION TESTS.
//
// Requires a real PostgreSQL connection. Tests the full PR lifecycle
// including budget reservation integration via subject_table/subject_id.

import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ReservationService } from '../budgeting/reservation.service';
import { NotificationService } from '../notification/notification.service';
import { WorkflowService } from '../workflow/workflow.service';

import { PurchaseRequestService } from './purchase-request.service';

const prisma = new PrismaClient();
const reservationService = new ReservationService(prisma as unknown as PrismaService);
const workflowService = new WorkflowService(prisma as unknown as PrismaService);
const notificationService = new NotificationService(prisma as unknown as PrismaService);
const service = new PurchaseRequestService(
  prisma as unknown as PrismaService,
  reservationService,
  workflowService,
  notificationService,
);
const runId = Date.now().toString(36);

let organizationId: string;
let budgetHeaderId: string;
let endUserId: string;
let deptHeadUserId: string;
let budgetOfficerUserId: string;

beforeAll(async () => {
  const organization = await prisma.organization.findFirstOrThrow({ where: { code: 'SBWD' } });
  organizationId = organization.id;
  const header = await prisma.budgetHeader.findFirstOrThrow({ where: { organizationId } });
  budgetHeaderId = header.id;
  const endUser = await prisma.user.findFirstOrThrow({
    where: { organizationId, username: 'end_user' },
  });
  endUserId = endUser.id;
  const deptHead = await prisma.user.findFirstOrThrow({
    where: { organizationId, username: 'dept_head' },
  });
  deptHeadUserId = deptHead.id;
  const budgetOfficer = await prisma.user.findFirstOrThrow({
    where: { organizationId, username: 'budget_officer' },
  });
  budgetOfficerUserId = budgetOfficer.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeReleasedRelease(amount: number, suffix: string) {
  return prisma.budgetRelease.create({
    data: {
      organizationId,
      budgetHeaderId,
      releaseNumber: `PR-T-${suffix}-${runId}`.slice(0, 30),
      releaseDate: new Date(),
      releasedAmount: amount,
      status: 'released',
    },
  });
}

async function cleanup(releaseId: string) {
  await prisma.purchaseRequestItem
    .deleteMany({
      where: { purchaseRequest: { budgetReleaseId: releaseId } },
    })
    .catch(() => {});
  await prisma.budgetTransactionLog
    .deleteMany({ where: { budgetReleaseId: releaseId } })
    .catch(() => {});
  await prisma.budgetReservation
    .deleteMany({ where: { budgetReleaseId: releaseId } })
    .catch(() => {});
  await prisma.purchaseRequest
    .deleteMany({ where: { budgetReleaseId: releaseId } })
    .catch(() => {});
  await prisma.budgetRelease.delete({ where: { id: releaseId } }).catch(() => {});
}

describe('PurchaseRequestService lifecycle', () => {
  it('creates a draft PR with items and computed total', async () => {
    const release = await makeReleasedRelease(100_000, 'C1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Test PR',
        items: [
          { description: 'Item A', quantity: 10, unitOfMeasure: 'pc', estimatedUnitCost: 100 },
          { description: 'Item B', quantity: 5, unitOfMeasure: 'box', estimatedUnitCost: 200 },
        ],
      });

      expect(pr.status).toBe('draft');
      expect(pr.prNumber).toMatch(/^PR-\d+$/);
      expect(pr.totalAmount.toFixed(2)).toBe('2000.00');
      expect(pr.items).toHaveLength(2);
      expect(pr.items[0]!.itemNumber).toBe(1);
      expect(pr.items[1]!.itemNumber).toBe(2);

      const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({
        where: { id: release.id },
      });
      expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');
    } finally {
      await cleanup(release.id);
    }
  });

  it('rejects PR creation with zero items', async () => {
    const release = await makeReleasedRelease(100_000, 'C2');
    try {
      await expect(
        service.create(organizationId, { budgetReleaseId: release.id, title: 'Empty', items: [] }),
      ).rejects.toThrow(/at least one item/);
    } finally {
      await cleanup(release.id);
    }
  });

  it('submit moves PR to submitted status (no budget hold at this stage)', async () => {
    const release = await makeReleasedRelease(100_000, 'S1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Submit Test',
        items: [
          { description: 'Widget', quantity: 10, unitOfMeasure: 'pc', estimatedUnitCost: 500 },
        ],
      });
      expect(pr.totalAmount.toFixed(2)).toBe('5000.00');

      const submitted = await service.submit(organizationId, pr.id, pr.version);
      expect(submitted.status).toBe('submitted');

      const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({
        where: { id: release.id },
      });
      expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');
    } finally {
      await cleanup(release.id);
    }
  });

  it('endorse moves PR from submitted to endorsed', async () => {
    const release = await makeReleasedRelease(100_000, 'E1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Endorse Test',
        createdBy: endUserId,
        items: [
          { description: 'Gadget', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 3000 },
        ],
      });
      const submitted = await service.submit(organizationId, pr.id, pr.version);
      const endorsed = await service.endorse(
        organizationId,
        submitted.id,
        submitted.version,
        deptHeadUserId,
      );
      expect(endorsed.status).toBe('endorsed');
      expect(endorsed.endorsedBy).toBe(deptHeadUserId);
    } finally {
      await cleanup(release.id);
    }
  });

  it('budget certify holds budget and moves to budget_certified', async () => {
    const release = await makeReleasedRelease(100_000, 'BC1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Budget Certify Test',
        createdBy: endUserId,
        items: [{ description: 'Tool', quantity: 2, unitOfMeasure: 'pc', estimatedUnitCost: 1500 }],
      });
      const submitted = await service.submit(organizationId, pr.id, pr.version);
      const endorsed = await service.endorse(
        organizationId,
        submitted.id,
        submitted.version,
        deptHeadUserId,
      );
      const certified = await service.budgetCertify(
        organizationId,
        endorsed.id,
        endorsed.version,
        budgetOfficerUserId,
      );
      expect(certified.status).toBe('budget_certified');

      const reservation = await prisma.budgetReservation.findFirst({
        where: { subjectTable: 'procurement.purchase_requests', subjectId: pr.id },
      });
      expect(reservation).toBeTruthy();
      expect(reservation!.status).toBe('approved');
      expect(reservation!.reservationAmount.toFixed(2)).toBe('3000.00');

      const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({
        where: { id: release.id },
      });
      expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('3000.00');
    } finally {
      await cleanup(release.id);
    }
  });

  it('reject releases the held budget back', async () => {
    const release = await makeReleasedRelease(100_000, 'R1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Reject Test',
        items: [
          { description: 'Thing', quantity: 20, unitOfMeasure: 'pc', estimatedUnitCost: 100 },
        ],
      });
      const submitted = await service.submit(organizationId, pr.id, pr.version);
      const rejected = await service.reject(
        organizationId,
        submitted.id,
        submitted.version,
        undefined,
        'Too costly',
      );
      expect(rejected.status).toBe('rejected');

      const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({
        where: { id: release.id },
      });
      expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');
      expect(reloadedRelease.availableAmount.toFixed(2)).toBe('100000.00');
    } finally {
      await cleanup(release.id);
    }
  });

  it('cancel from submitted releases held budget', async () => {
    const release = await makeReleasedRelease(100_000, 'X1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Cancel Test',
        items: [{ description: 'Stuff', quantity: 5, unitOfMeasure: 'pc', estimatedUnitCost: 400 }],
      });
      const submitted = await service.submit(organizationId, pr.id, pr.version);
      const cancelled = await service.cancel(
        organizationId,
        submitted.id,
        submitted.version,
        undefined,
        'Changed mind',
      );
      expect(cancelled.status).toBe('cancelled');

      const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({
        where: { id: release.id },
      });
      expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');
    } finally {
      await cleanup(release.id);
    }
  });

  it('cancel from draft does not touch budget', async () => {
    const release = await makeReleasedRelease(100_000, 'X2');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Draft Cancel Test',
        items: [{ description: 'Stuff', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 100 }],
      });
      const cancelled = await service.cancel(organizationId, pr.id, pr.version);
      expect(cancelled.status).toBe('cancelled');

      const reloadedRelease = await prisma.budgetRelease.findUniqueOrThrow({
        where: { id: release.id },
      });
      expect(reloadedRelease.reservedAmount.toFixed(2)).toBe('0.00');
    } finally {
      await cleanup(release.id);
    }
  });

  it('org isolation: cannot access PR from a different org', async () => {
    const release = await makeReleasedRelease(100_000, 'ISO');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Isolation Test',
        items: [{ description: 'X', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 50 }],
      });

      const fakeOrgId = '00000000-0000-4000-8000-000000000000';
      await expect(service.submit(fakeOrgId, pr.id, pr.version)).rejects.toThrow(/not found/);
    } finally {
      await cleanup(release.id);
    }
  });

  it('update replaces items and recalculates total', async () => {
    const release = await makeReleasedRelease(100_000, 'U1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Update Test',
        items: [{ description: 'Old', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 100 }],
      });

      const updated = await service.update(organizationId, pr.id, pr.version, {
        title: 'Updated Title',
        items: [
          { description: 'New A', quantity: 2, unitOfMeasure: 'set', estimatedUnitCost: 500 },
          { description: 'New B', quantity: 3, unitOfMeasure: 'pc', estimatedUnitCost: 300 },
        ],
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.totalAmount.toFixed(2)).toBe('1900.00');
      expect(updated.items).toHaveLength(2);
    } finally {
      await cleanup(release.id);
    }
  });

  it('return for correction moves PR back to returned status', async () => {
    const release = await makeReleasedRelease(100_000, 'RT1');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Return Test',
        createdBy: endUserId,
        items: [
          { description: 'Widget', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 500 },
        ],
      });
      const submitted = await service.submit(organizationId, pr.id, pr.version);
      const returned = await service.returnForCorrection(
        organizationId,
        submitted.id,
        submitted.version,
        deptHeadUserId,
        'Fix description',
      );
      expect(returned.status).toBe('returned');
    } finally {
      await cleanup(release.id);
    }
  });

  it('editing a returned PR moves it back to draft', async () => {
    const release = await makeReleasedRelease(100_000, 'RT2');
    try {
      const pr = await service.create(organizationId, {
        budgetReleaseId: release.id,
        title: 'Return Edit Test',
        createdBy: endUserId,
        items: [
          { description: 'Widget', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 500 },
        ],
      });
      const submitted = await service.submit(organizationId, pr.id, pr.version);
      const returned = await service.returnForCorrection(
        organizationId,
        submitted.id,
        submitted.version,
        deptHeadUserId,
        'Fix it',
      );

      const edited = await service.update(organizationId, returned.id, returned.version, {
        title: 'Fixed Title',
      });
      expect(edited.status).toBe('draft');
      expect(edited.title).toBe('Fixed Title');
    } finally {
      await cleanup(release.id);
    }
  });
});
