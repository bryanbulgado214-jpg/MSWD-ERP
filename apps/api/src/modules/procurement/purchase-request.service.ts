import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, type PurchaseRequestStatus, type ItemClassification } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';
import { ReservationService } from '../budgeting/reservation.service';
import { NotificationService } from '../notification/notification.service';
import { WorkflowService } from '../workflow/workflow.service';
import type { CreatePurchaseRequestInput, PurchaseRequestWithItems, UpdatePurchaseRequestInput } from './purchase-request.types';
import { PR_SUBJECT_TABLE } from './purchase-request.types';

const PR_WORKFLOW_NAME = 'Purchase Requisition Approval';
const PR_WORKFLOW_STEPS = [
  { name: 'Department Head Endorsement', approverRoleCode: 'DEPARTMENT_HEAD' },
  { name: 'Budget Review', approverRoleCode: 'BUDGET_OFFICER' },
  { name: 'Budget Certification', approverRoleCode: 'BUDGET_OFFICER' },
  { name: 'Final Approval', approverRoleCode: 'GENERAL_MANAGER', isFinalStep: true },
];

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationService: ReservationService,
    private readonly workflowService: WorkflowService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(organizationId: string, input: CreatePurchaseRequestInput): Promise<PurchaseRequestWithItems> {
    if (!input.items.length) {
      throw new BadRequestException('A purchase request must have at least one item.');
    }

    if (input.budgetReleaseId) {
      const release = await this.prisma.budgetRelease.findFirst({
        where: { id: input.budgetReleaseId, organizationId },
      });
      if (!release) {
        throw new NotFoundException(`Budget release ${input.budgetReleaseId} not found.`);
      }
    }

    const items = input.items.map((item, idx) => {
      const estimatedTotalCost = new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(item.estimatedUnitCost));
      return {
        itemNumber: idx + 1,
        description: item.description,
        quantity: new Prisma.Decimal(item.quantity),
        unitOfMeasure: item.unitOfMeasure,
        estimatedUnitCost: new Prisma.Decimal(item.estimatedUnitCost),
        estimatedTotalCost,
        accountCode: item.accountCode ?? null,
        technicalSpecification: item.technicalSpecification ?? null,
        ...(item.classification ? { classification: item.classification as ItemClassification } : {}),
      };
    });

    const totalAmount = items.reduce(
      (sum, item) => sum.plus(item.estimatedTotalCost),
      new Prisma.Decimal(0),
    );

    const prNumber = await this.generatePrNumber(organizationId);

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.purchaseRequest.create({
        data: {
          organizationId,
          prNumber,
          title: input.title,
          description: input.description ?? null,
          purpose: input.purpose ?? null,
          budgetReleaseId: input.budgetReleaseId ?? null,
          fiscalYearId: input.fiscalYearId ?? null,
          departmentId: input.departmentId ?? null,
          departmentHeadId: input.departmentHeadId ?? null,
          procurementCategoryId: input.procurementCategoryId ?? null,
          requestedDeliveryDate: input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null,
          deliveryLocationId: input.deliveryLocationId ?? null,
          ppmpItemId: input.ppmpItemId ?? null,
          appItemId: input.appItemId ?? null,
          budgetLineId: input.budgetLineId ?? null,
          responsibilityCenterId: input.responsibilityCenterId ?? null,
          fundSourceId: input.fundSourceId ?? null,
          totalAmount,
          status: 'draft',
          createdBy: input.createdBy ?? null,
          items: { create: items },
        },
        include: { items: { orderBy: { itemNumber: 'asc' } } },
      }),
    );
  }

  async update(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    input: UpdatePurchaseRequestInput,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['draft', 'returned'], 'edited');

    return runAudited(this.prisma, input.updatedBy, async (tx) => {
      const data: Prisma.PurchaseRequestUncheckedUpdateManyInput = {
        updatedBy: input.updatedBy ?? null,
      };
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.purpose !== undefined) data.purpose = input.purpose;
      if (input.budgetReleaseId !== undefined) data.budgetReleaseId = input.budgetReleaseId;
      if (input.fiscalYearId !== undefined) data.fiscalYearId = input.fiscalYearId;
      if (input.departmentId !== undefined) data.departmentId = input.departmentId;
      if (input.departmentHeadId !== undefined) data.departmentHeadId = input.departmentHeadId;
      if (input.procurementCategoryId !== undefined) data.procurementCategoryId = input.procurementCategoryId;
      if (input.requestedDeliveryDate !== undefined) {
        data.requestedDeliveryDate = input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null;
      }
      if (input.deliveryLocationId !== undefined) data.deliveryLocationId = input.deliveryLocationId;
      if (input.ppmpItemId !== undefined) data.ppmpItemId = input.ppmpItemId;
      if (input.appItemId !== undefined) data.appItemId = input.appItemId;
      if (input.budgetLineId !== undefined) data.budgetLineId = input.budgetLineId;
      if (input.responsibilityCenterId !== undefined) data.responsibilityCenterId = input.responsibilityCenterId;
      if (input.fundSourceId !== undefined) data.fundSourceId = input.fundSourceId;

      if (input.items !== undefined) {
        if (!input.items.length) {
          throw new BadRequestException('A purchase request must have at least one item.');
        }

        await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: prId } });

        const items = input.items.map((item, idx) => {
          const estimatedTotalCost = new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(item.estimatedUnitCost));
          return {
            purchaseRequestId: prId,
            itemNumber: idx + 1,
            description: item.description,
            quantity: new Prisma.Decimal(item.quantity),
            unitOfMeasure: item.unitOfMeasure,
            estimatedUnitCost: new Prisma.Decimal(item.estimatedUnitCost),
            estimatedTotalCost,
            accountCode: item.accountCode ?? null,
            technicalSpecification: item.technicalSpecification ?? null,
            ...(item.classification ? { classification: item.classification as ItemClassification } : {}),
          };
        });

        await tx.purchaseRequestItem.createMany({ data: items });

        const totalAmount = items.reduce(
          (sum, item) => sum.plus(item.estimatedTotalCost),
          new Prisma.Decimal(0),
        );
        data.totalAmount = totalAmount;
      }

      if (pr.status === 'returned') {
        data.status = 'draft';
        data.remarks = null;
      }

      return this.applyVersionedUpdate(tx, prId, expectedVersion, data);
    });
  }

  // ── Step 1: End-user submits PR ──
  async submit(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['draft'], 'submitted');

    if (pr.totalAmount.equals(0)) {
      throw new BadRequestException('Cannot submit a purchase request with zero total amount.');
    }

    const result = await this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'submitted',
      updatedBy: actorUserId ?? null,
    }, actorUserId);

    if (pr.departmentHeadId) {
      await this.notificationService.create({
        organizationId,
        userId: pr.departmentHeadId,
        title: `PR ${pr.prNumber} submitted for your endorsement`,
        body: pr.title,
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      });
    } else {
      await this.notificationService.notifyUsersWithRole(
        organizationId,
        'DEPARTMENT_HEAD',
        {
          title: `PR ${pr.prNumber} submitted for endorsement`,
          body: pr.title,
          linkUrl: `/procurement/purchase-requests/${pr.id}`,
          relatedTable: PR_SUBJECT_TABLE,
          relatedId: pr.id,
        },
      );
    }

    return result;
  }

  // ── Step 2: Department Head endorses ──
  async endorse(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['submitted'], 'endorsed');
    this.preventSelfApproval(pr, actorUserId);

    const result = await this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'endorsed',
      endorsedBy: actorUserId,
      endorsedAt: new Date(),
      updatedBy: actorUserId,
    }, actorUserId);

    await this.notificationService.notifyUsersWithRole(
      organizationId,
      'BUDGET_OFFICER',
      {
        title: `PR ${pr.prNumber} endorsed — ready for budget review`,
        body: `${pr.title} (${pr.totalAmount})`,
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      },
    );

    return result;
  }

  // ── Step 3: Budget Officer certifies (and holds budget) ──
  async budgetCertify(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['endorsed'], 'budget-certified');
    this.preventSelfApproval(pr, actorUserId);

    if (!pr.budgetReleaseId) {
      throw new BadRequestException('Cannot certify budget without a budget release linked to this PR.');
    }

    const reservation = await this.reservationService.createDraft(organizationId, {
      budgetReleaseId: pr.budgetReleaseId,
      reservationAmount: pr.totalAmount,
      subjectTable: PR_SUBJECT_TABLE,
      subjectId: pr.id,
      createdBy: actorUserId,
    });

    await this.reservationService.submit(
      organizationId,
      reservation.id,
      reservation.version,
      actorUserId,
    );

    await this.reservationService.approve(
      organizationId,
      reservation.id,
      reservation.version + 1,
      actorUserId,
    );

    const result = await this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'budget_certified',
      budgetCertifiedBy: actorUserId,
      budgetCertifiedAt: new Date(),
      updatedBy: actorUserId,
    }, actorUserId);

    await this.notificationService.notifyUsersWithRole(
      organizationId,
      'GENERAL_MANAGER',
      {
        title: `PR ${pr.prNumber} budget certified — awaiting final approval`,
        body: `${pr.title} (${pr.totalAmount})`,
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      },
    );

    return result;
  }

  // ── Step 4: GM / HoPE final approval ──
  async finalApprove(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['budget_certified'], 'approved');
    this.preventSelfApproval(pr, actorUserId);

    const result = await this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'approved',
      approvedBy: actorUserId,
      approvedAt: new Date(),
      updatedBy: actorUserId,
    }, actorUserId);

    await this.notificationService.notifyUsersWithRole(
      organizationId,
      'PROCUREMENT_OFFICER',
      {
        title: `PR ${pr.prNumber} approved — ready for procurement processing`,
        body: `${pr.title} (${pr.totalAmount})`,
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      },
    );

    if (pr.createdBy) {
      await this.notificationService.create({
        organizationId,
        userId: pr.createdBy,
        title: `Your PR ${pr.prNumber} has been approved`,
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      });
    }

    return result;
  }

  // ── Step 5: Procurement Officer accepts for procurement ──
  async acceptForProcurement(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['approved'], 'accepted for procurement');

    return this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'procurement_in_progress',
      updatedBy: actorUserId,
    }, actorUserId);
  }

  // ── Return actions ──
  async returnForCorrection(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['submitted', 'endorsed', 'budget_certified'], 'returned');

    if (pr.status !== 'submitted') {
      const reservation = await this.findLinkedReservation(pr.id);
      if (reservation) {
        await this.reservationService.cancel(
          organizationId,
          reservation.id,
          reservation.version,
          actorUserId,
          remarks,
        );
      }
    }

    const result = await this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'returned',
      updatedBy: actorUserId,
      ...(remarks ? { remarks } : { remarks: null }),
    }, actorUserId);

    if (pr.createdBy) {
      await this.notificationService.create({
        organizationId,
        userId: pr.createdBy,
        title: `PR ${pr.prNumber} returned for correction`,
        ...(remarks ? { body: remarks } : {}),
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      });
    }

    return result;
  }

  async reject(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId?: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['submitted', 'endorsed', 'budget_certified'], 'rejected');
    this.preventSelfApproval(pr, actorUserId);

    const reservation = await this.findLinkedReservation(pr.id);
    if (reservation) {
      await this.reservationService.reject(
        organizationId,
        reservation.id,
        reservation.version,
        actorUserId,
        remarks,
      );
    }

    const result = await this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'rejected',
      updatedBy: actorUserId ?? null,
      ...(remarks ? { remarks } : { remarks: null }),
    }, actorUserId);

    if (pr.createdBy) {
      await this.notificationService.create({
        organizationId,
        userId: pr.createdBy,
        title: `PR ${pr.prNumber} has been rejected`,
        ...(remarks ? { body: remarks } : {}),
        linkUrl: `/procurement/purchase-requests/${pr.id}`,
        relatedTable: PR_SUBJECT_TABLE,
        relatedId: pr.id,
      });
    }

    return result;
  }

  async cancel(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId?: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['draft', 'submitted', 'endorsed', 'budget_certified', 'approved', 'returned'], 'cancelled');

    if (pr.status !== 'draft') {
      const reservation = await this.findLinkedReservation(pr.id);
      if (reservation) {
        await this.reservationService.cancel(
          organizationId,
          reservation.id,
          reservation.version,
          actorUserId,
          remarks,
        );
      }
    }

    return this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'cancelled',
      updatedBy: actorUserId ?? null,
    }, actorUserId);
  }

  // ── Procurement lifecycle transitions ──

  async markLifecycle(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    targetStatus: PurchaseRequestStatus,
    actorUserId: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);

    const lifecycleTransitions: Record<string, PurchaseRequestStatus[]> = {
      awarded: ['procurement_in_progress'],
      po_issued: ['awarded'],
      delivered: ['po_issued'],
      inspected: ['delivered'],
      completed: ['inspected'],
    };

    const allowed = lifecycleTransitions[targetStatus];
    if (!allowed) {
      throw new BadRequestException(`"${targetStatus}" is not a valid lifecycle transition.`);
    }
    this.assertStatus(pr, allowed, targetStatus);

    return this.updateWithVersionCheck(prId, expectedVersion, {
      status: targetStatus,
      updatedBy: actorUserId,
    }, actorUserId);
  }

  // ── Inspection ──
  async inspect(
    organizationId: string,
    prId: string,
    expectedVersion: number,
    actorUserId: string,
    remarks?: string,
  ): Promise<PurchaseRequestWithItems> {
    const pr = await this.requirePR(organizationId, prId);
    this.assertStatus(pr, ['delivered'], 'inspected');

    return this.updateWithVersionCheck(prId, expectedVersion, {
      status: 'inspected',
      updatedBy: actorUserId,
    }, actorUserId);
  }

  // ── Revision snapshot ──
  async createRevisionSnapshot(
    organizationId: string,
    prId: string,
    reason: string,
    actorUserId: string,
  ): Promise<void> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id: prId, organizationId },
      include: { items: { orderBy: { itemNumber: 'asc' } } },
    });
    if (!pr) throw new NotFoundException(`Purchase request ${prId} not found.`);

    const nextRevision = pr.revisionNumber + 1;

    await runAudited(this.prisma, actorUserId, async (tx) => {
      await tx.prRevision.create({
        data: {
          purchaseRequestId: prId,
          revisionNumber: pr.revisionNumber,
          snapshotData: {
            title: pr.title,
            description: pr.description,
            totalAmount: pr.totalAmount.toString(),
            items: pr.items.map((i) => ({
              itemNumber: i.itemNumber,
              description: i.description,
              quantity: i.quantity.toString(),
              unitOfMeasure: i.unitOfMeasure,
              estimatedUnitCost: i.estimatedUnitCost.toString(),
              estimatedTotalCost: i.estimatedTotalCost.toString(),
            })),
          },
          reason,
          createdBy: actorUserId,
        },
      });

      await tx.purchaseRequest.update({
        where: { id: prId },
        data: { revisionNumber: nextRevision },
      });
    });
  }

  // ── Query helpers ──

  async findAllForUser(
    organizationId: string,
    userId: string,
    filters?: { status?: string },
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId,
        createdBy: userId,
        ...(filters?.status ? { status: filters.status as PurchaseRequestStatus } : {}),
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForDepartment(
    organizationId: string,
    departmentId: string,
    filters?: { status?: string },
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId,
        departmentId,
        ...(filters?.status ? { status: filters.status as PurchaseRequestStatus } : {}),
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── helpers ──

  private async requirePR(organizationId: string, prId: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id: prId, organizationId },
    });
    if (!pr) {
      throw new NotFoundException(`Purchase request ${prId} not found.`);
    }
    return pr;
  }

  private preventSelfApproval(pr: { createdBy: string | null }, actorUserId?: string): void {
    if (actorUserId && pr.createdBy === actorUserId) {
      throw new BadRequestException('You cannot approve or reject a purchase request you created.');
    }
  }

  private assertStatus(
    pr: { status: PurchaseRequestStatus },
    allowed: PurchaseRequestStatus[],
    actionLabel: string,
  ): void {
    if (!allowed.includes(pr.status)) {
      throw new BadRequestException(
        `Purchase request is "${pr.status}" and cannot be ${actionLabel} (allowed from: ${allowed.join(', ')}).`,
      );
    }
  }

  private async findLinkedReservation(prId: string) {
    return this.prisma.budgetReservation.findFirst({
      where: {
        subjectTable: PR_SUBJECT_TABLE,
        subjectId: prId,
        status: { notIn: ['cancelled', 'rejected'] },
      },
    });
  }

  private async generatePrNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'PURCHASE_REQUEST'
        AND fiscal_year_id IS NULL
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `PR-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'PURCHASE_REQUEST', 'PR-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate PR number from document_sequences.');
    return `PR-${String(Number(row.next_number)).padStart(6, '0')}`;
  }

  private async updateWithVersionCheck(
    id: string,
    expectedVersion: number,
    data: Prisma.PurchaseRequestUncheckedUpdateManyInput,
    actorUserId?: string | null,
  ): Promise<PurchaseRequestWithItems> {
    return runAudited(this.prisma, actorUserId, (tx) => this.applyVersionedUpdate(tx, id, expectedVersion, data));
  }

  private async applyVersionedUpdate(
    client: Pick<PrismaService, 'purchaseRequest'>,
    id: string,
    expectedVersion: number,
    data: Prisma.PurchaseRequestUncheckedUpdateManyInput,
  ): Promise<PurchaseRequestWithItems> {
    const result = await client.purchaseRequest.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException('Purchase request was modified concurrently — reload and try again.');
    }
    return client.purchaseRequest.findUniqueOrThrow({
      where: { id },
      include: { items: { orderBy: { itemNumber: 'asc' } } },
    });
  }
}
