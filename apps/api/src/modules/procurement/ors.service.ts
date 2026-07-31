import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited, setAuditActor } from '../budgeting/audit-actor.util';

const ORS_SELECT = {
  id: true,
  orsNumber: true,
  orsDate: true,
  accountCode: true,
  originalAmount: true,
  adjustmentAmount: true,
  adjustedAmount: true,
  cumulativePayable: true,
  cumulativePaid: true,
  remainingUnpaid: true,
  deobligatedAmount: true,
  requestingOfficeCertifiedAt: true,
  budgetCertifiedAt: true,
  obligationPostingDate: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  caf: {
    select: {
      id: true,
      cafNumber: true,
      certifiedAmount: true,
      status: true,
    },
  },
  purchaseRequest: {
    select: {
      id: true,
      prNumber: true,
      title: true,
      totalAmount: true,
    },
  },
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      contractAmount: true,
      supplier: { select: { id: true, name: true, tin: true, address: true } },
    },
  },
  supplier: {
    select: { id: true, name: true, tin: true, address: true },
  },
  budgetRelease: {
    select: {
      id: true,
      releaseNumber: true,
      budgetHeader: {
        select: {
          responsibilityCenter: { select: { id: true, code: true, name: true } },
          fundSource: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  budgetLine: {
    select: { id: true, accountCode: true, description: true },
  },
  fundSource: {
    select: { id: true, code: true, name: true },
  },
  responsibilityCenter: {
    select: { id: true, code: true, name: true },
  },
  requestingOffice: {
    select: { id: true, code: true, name: true },
  },
  requestingOfficeCertifier: {
    select: { id: true, username: true },
  },
  budgetCertifier: {
    select: { id: true, username: true },
  },
  creator: {
    select: { id: true, username: true },
  },
  children: {
    select: {
      id: true,
      childType: true,
      referenceNumber: true,
      childDate: true,
      amount: true,
      description: true,
      status: true,
      remarks: true,
      createdAt: true,
      version: true,
      certifier: { select: { id: true, username: true } },
      creator: { select: { id: true, username: true } },
    },
    orderBy: { childDate: 'asc' as const },
  },
  adjustments: {
    select: {
      id: true,
      adjustmentType: true,
      signedAmount: true,
      reason: true,
      status: true,
      createdAt: true,
      approver: { select: { id: true, username: true } },
      creator: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class OrsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { status?: string; cafId?: string; purchaseRequestId?: string }) {
    return this.prisma.obligationRequest.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.cafId ? { cafId: filters.cafId } : {}),
        ...(filters?.purchaseRequestId ? { purchaseRequestId: filters.purchaseRequestId } : {}),
      },
      select: ORS_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const ors = await this.prisma.obligationRequest.findFirst({
      where: { id, organizationId },
      select: ORS_SELECT,
    });
    if (!ors) throw new NotFoundException('ORS not found.');
    return ors;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      cafId: string;
      orsDate: string;
      originalAmount: number;
      budgetLineId?: string;
      accountCode?: string;
      requestingOfficeId?: string;
      remarks?: string;
    },
  ) {
    const caf = await this.prisma.certificationOfAvailability.findFirst({
      where: { id: data.cafId, organizationId, status: 'certified' },
    });
    if (!caf) throw new NotFoundException('Certified CAF not found.');

    const originalAmount = new Prisma.Decimal(data.originalAmount);
    if (originalAmount.greaterThan(caf.certifiedAmount)) {
      throw new BadRequestException(
        `ORS amount (${originalAmount.toFixed(2)}) cannot exceed CAF certified amount (${caf.certifiedAmount.toFixed(2)}).`,
      );
    }

    const existingOrs = await this.prisma.obligationRequest.findFirst({
      where: { cafId: data.cafId, status: { notIn: ['cancelled'] } },
    });
    if (existingOrs) {
      throw new ConflictException('An active ORS already exists for this CAF.');
    }

    const orsNumber = await this.generateOrsNumber(organizationId);

    return runAudited(this.prisma, userId, (tx) =>
      tx.obligationRequest.create({
        data: {
          organizationId,
          orsNumber,
          orsDate: new Date(data.orsDate),
          cafId: data.cafId,
          purchaseRequestId: caf.purchaseRequestId,
          ...(caf.purchaseOrderId ? { purchaseOrderId: caf.purchaseOrderId } : {}),
          ...(caf.supplierId ? { supplierId: caf.supplierId } : {}),
          budgetReleaseId: caf.budgetReleaseId,
          ...(caf.budgetReservationId ? { budgetReservationId: caf.budgetReservationId } : {}),
          ...(data.budgetLineId ? { budgetLineId: data.budgetLineId } : {}),
          fundSourceId: caf.fundSourceId,
          responsibilityCenterId: caf.responsibilityCenterId,
          ...(data.accountCode ? { accountCode: data.accountCode } : {}),
          originalAmount,
          adjustedAmount: originalAmount,
          remainingUnpaid: originalAmount,
          ...(data.requestingOfficeId ? { requestingOfficeId: data.requestingOfficeId } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: ORS_SELECT,
      }),
    );
  }

  async submitForRequestingCertification(
    organizationId: string, id: string, userId: string, expectedVersion: number,
  ) {
    const ors = await this.getAndValidate(organizationId, id, expectedVersion);
    if (ors.status !== 'draft') {
      throw new BadRequestException('Only draft ORS can be submitted.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.obligationRequest.update({
        where: { id },
        data: {
          status: 'for_requesting_certification',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ORS_SELECT,
      }),
    );
  }

  async certifyRequestingOffice(
    organizationId: string, id: string, userId: string, expectedVersion: number,
  ) {
    const ors = await this.getAndValidate(organizationId, id, expectedVersion);
    if (ors.status !== 'for_requesting_certification') {
      throw new BadRequestException('ORS is not pending requesting office certification.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.obligationRequest.update({
        where: { id },
        data: {
          status: 'for_budget_certification',
          requestingOfficeCertifiedBy: userId,
          requestingOfficeCertifiedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ORS_SELECT,
      }),
    );
  }

  async certifyBudgetAndPostObligation(
    organizationId: string, id: string, userId: string, expectedVersion: number,
  ) {
    const ors = await this.getAndValidate(organizationId, id, expectedVersion);
    if (ors.status !== 'for_budget_certification') {
      throw new BadRequestException('ORS is not pending budget certification.');
    }

    return this.prisma.$transaction(async (tx) => {
      await setAuditActor(tx, userId);

      const lockedRelease = await tx.$queryRaw<
        { id: string; status: string; reserved_amount: string; available_amount: string }[]
      >(Prisma.sql`
        SELECT id, status::text, reserved_amount::text, available_amount::text
        FROM budget_releases
        WHERE id = ${ors.budgetReleaseId}::uuid
        FOR UPDATE
      `);

      if (lockedRelease.length === 0) throw new NotFoundException('Budget release not found.');
      const rel = lockedRelease[0]!;

      if (rel.status !== 'released') {
        throw new BadRequestException('Budget release is not in released status.');
      }

      const available = new Prisma.Decimal(rel.available_amount);
      if (available.lessThan(ors.originalAmount)) {
        throw new BadRequestException(
          `Insufficient budget: available ${available.toFixed(2)}, obligation ${ors.originalAmount.toFixed(2)}`,
        );
      }

      await tx.budgetTransactionLog.create({
        data: {
          organizationId,
          budgetReleaseId: ors.budgetReleaseId,
          ...(ors.budgetReservationId ? { budgetReservationId: ors.budgetReservationId } : {}),
          transactionType: 'obligation',
          signedAmount: ors.originalAmount,
          remarks: `Obligation posted for ORS ${ors.orsNumber}`,
          createdBy: userId,
        },
      });

      const currentReserved = new Prisma.Decimal(rel.reserved_amount);
      const newReserved = currentReserved.plus(ors.originalAmount);

      await tx.$executeRaw(Prisma.sql`
        UPDATE budget_releases
        SET reserved_amount = ${newReserved.toFixed(2)}::decimal
        WHERE id = ${ors.budgetReleaseId}::uuid
      `);

      return tx.obligationRequest.update({
        where: { id },
        data: {
          status: 'obligated',
          budgetCertifiedBy: userId,
          budgetCertifiedAt: new Date(),
          obligationPostingDate: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ORS_SELECT,
      });
    });
  }

  async addChild(
    organizationId: string,
    orsId: string,
    userId: string,
    data: {
      childType: string;
      childDate: string;
      amount: number;
      referenceNumber?: string;
      description?: string;
      remarks?: string;
    },
  ) {
    const ors = await this.prisma.obligationRequest.findFirst({
      where: { id: orsId, organizationId },
    });
    if (!ors) throw new NotFoundException('ORS not found.');

    const activeStatuses = ['obligated', 'partially_payable', 'partially_paid'];
    if (!activeStatuses.includes(ors.status)) {
      throw new BadRequestException('ORS must be in obligated or partially paid status to add child records.');
    }

    const childAmount = new Prisma.Decimal(data.amount);

    return runAudited(this.prisma, userId, async (tx) => {
      const child = await tx.orsChild.create({
        data: {
          orsId,
          childType: data.childType as any,
          childDate: new Date(data.childDate),
          amount: childAmount,
          ...(data.referenceNumber ? { referenceNumber: data.referenceNumber } : {}),
          ...(data.description ? { description: data.description } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
      });

      if (['payable', 'billing'].includes(data.childType)) {
        const newPayable = ors.cumulativePayable.plus(childAmount);
        await tx.obligationRequest.update({
          where: { id: orsId },
          data: {
            cumulativePayable: newPayable,
            status: 'partially_payable',
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      } else if (data.childType === 'payment') {
        const newPaid = ors.cumulativePaid.plus(childAmount);
        const newRemaining = ors.adjustedAmount.minus(newPaid);
        const newStatus = newRemaining.lessThanOrEqualTo(0) ? 'fully_paid' : 'partially_paid';
        await tx.obligationRequest.update({
          where: { id: orsId },
          data: {
            cumulativePaid: newPaid,
            remainingUnpaid: Prisma.Decimal.max(newRemaining, new Prisma.Decimal(0)),
            status: newStatus as any,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      return child;
    });
  }

  async addAdjustment(
    organizationId: string,
    orsId: string,
    userId: string,
    data: {
      adjustmentType: string;
      signedAmount: number;
      reason: string;
      cafId?: string;
    },
  ) {
    const ors = await this.prisma.obligationRequest.findFirst({
      where: { id: orsId, organizationId },
    });
    if (!ors) throw new NotFoundException('ORS not found.');

    if (ors.status === 'cancelled' || ors.status === 'closed' || ors.status === 'draft') {
      throw new BadRequestException('Cannot adjust ORS in its current status.');
    }

    const signedAmount = new Prisma.Decimal(data.signedAmount);

    if (signedAmount.lessThan(0)) {
      const maxDeobligable = ors.adjustedAmount.minus(ors.cumulativePaid);
      if (signedAmount.abs().greaterThan(maxDeobligable)) {
        throw new BadRequestException(
          `De-obligation amount (${signedAmount.abs().toFixed(2)}) exceeds maximum de-obligable (${maxDeobligable.toFixed(2)}).`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await setAuditActor(tx, userId);

      const adjustment = await tx.orsAdjustment.create({
        data: {
          orsId,
          adjustmentType: data.adjustmentType,
          signedAmount,
          reason: data.reason,
          ...(data.cafId ? { cafId: data.cafId } : {}),
          approvedBy: userId,
          approvedAt: new Date(),
          status: 'approved',
          createdBy: userId,
        },
      });

      const newAdjustmentAmount = ors.adjustmentAmount.plus(signedAmount);
      const newAdjustedAmount = ors.originalAmount.plus(newAdjustmentAmount);
      const newRemaining = newAdjustedAmount.minus(ors.cumulativePaid);
      const newDeobligated = signedAmount.lessThan(0)
        ? ors.deobligatedAmount.plus(signedAmount.abs())
        : ors.deobligatedAmount;

      await tx.obligationRequest.update({
        where: { id: orsId },
        data: {
          adjustmentAmount: newAdjustmentAmount,
          adjustedAmount: newAdjustedAmount,
          remainingUnpaid: Prisma.Decimal.max(newRemaining, new Prisma.Decimal(0)),
          deobligatedAmount: newDeobligated,
          status: 'adjusted',
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      if (signedAmount.lessThan(0)) {
        const lockedRelease = await tx.$queryRaw<
          { reserved_amount: string }[]
        >(Prisma.sql`
          SELECT reserved_amount::text FROM budget_releases
          WHERE id = ${ors.budgetReleaseId}::uuid FOR UPDATE
        `);

        if (lockedRelease.length > 0) {
          const currentReserved = new Prisma.Decimal(lockedRelease[0]!.reserved_amount);
          const newReserved = currentReserved.plus(signedAmount);

          await tx.$executeRaw(Prisma.sql`
            UPDATE budget_releases
            SET reserved_amount = ${Prisma.Decimal.max(newReserved, new Prisma.Decimal(0)).toFixed(2)}::decimal
            WHERE id = ${ors.budgetReleaseId}::uuid
          `);

          await tx.budgetTransactionLog.create({
            data: {
              organizationId,
              budgetReleaseId: ors.budgetReleaseId,
              ...(ors.budgetReservationId ? { budgetReservationId: ors.budgetReservationId } : {}),
              transactionType: 'obligation_release',
              signedAmount,
              remarks: `De-obligation for ORS ${ors.orsNumber}: ${data.reason}`,
              createdBy: userId,
            },
          });
        }
      }

      return adjustment;
    });
  }

  async cancel(
    organizationId: string, id: string, userId: string, expectedVersion: number, remarks?: string,
  ) {
    const ors = await this.getAndValidate(organizationId, id, expectedVersion);
    if (ors.status === 'cancelled' || ors.status === 'closed') {
      throw new BadRequestException('ORS is already cancelled or closed.');
    }
    if (ors.cumulativePaid.greaterThan(0)) {
      throw new BadRequestException('Cannot cancel ORS with existing payments. Use adjustment instead.');
    }

    return this.prisma.$transaction(async (tx) => {
      await setAuditActor(tx, userId);

      if (['obligated', 'partially_payable', 'adjusted'].includes(ors.status)) {
        const lockedRelease = await tx.$queryRaw<
          { reserved_amount: string }[]
        >(Prisma.sql`
          SELECT reserved_amount::text FROM budget_releases
          WHERE id = ${ors.budgetReleaseId}::uuid FOR UPDATE
        `);

        if (lockedRelease.length > 0) {
          const currentReserved = new Prisma.Decimal(lockedRelease[0]!.reserved_amount);
          const releaseAmount = ors.adjustedAmount;
          const newReserved = Prisma.Decimal.max(
            currentReserved.minus(releaseAmount),
            new Prisma.Decimal(0),
          );

          await tx.$executeRaw(Prisma.sql`
            UPDATE budget_releases
            SET reserved_amount = ${newReserved.toFixed(2)}::decimal
            WHERE id = ${ors.budgetReleaseId}::uuid
          `);

          await tx.budgetTransactionLog.create({
            data: {
              organizationId,
              budgetReleaseId: ors.budgetReleaseId,
              ...(ors.budgetReservationId ? { budgetReservationId: ors.budgetReservationId } : {}),
              transactionType: 'obligation_release',
              signedAmount: releaseAmount.negated(),
              remarks: `ORS ${ors.orsNumber} cancelled${remarks ? ': ' + remarks : ''}`,
              createdBy: userId,
            },
          });
        }
      }

      return tx.obligationRequest.update({
        where: { id },
        data: {
          status: 'cancelled',
          ...(remarks ? { remarks } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ORS_SELECT,
      });
    });
  }

  private async getAndValidate(organizationId: string, id: string, expectedVersion: number) {
    const ors = await this.prisma.obligationRequest.findFirst({
      where: { id, organizationId },
    });
    if (!ors) throw new NotFoundException('ORS not found.');
    if (ors.version !== expectedVersion) {
      throw new ConflictException('ORS was modified by another user. Please refresh and try again.');
    }
    return ors;
  }

  private async generateOrsNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'ORS'
        AND fiscal_year_id IS NULL
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `ORS-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'ORS', 'ORS-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate ORS number from document_sequences.');
    return `ORS-${String(Number(row.next_number)).padStart(6, '0')}`;
  }
}
