import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';
import { BudgetCalculationService } from '../budgeting/budget-calculation.service';

const CAF_SELECT = {
  id: true,
  cafNumber: true,
  certificationDate: true,
  accountCode: true,
  certifiedAmount: true,
  availableBefore: true,
  availableAfter: true,
  certifiedAt: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  purchaseRequest: {
    select: {
      id: true,
      prNumber: true,
      title: true,
      totalAmount: true,
      status: true,
      department: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, username: true } },
    },
  },
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      contractAmount: true,
      status: true,
      supplier: { select: { id: true, name: true, tin: true, address: true } },
    },
  },
  budgetRelease: {
    select: {
      id: true,
      releaseNumber: true,
      releasedAmount: true,
      availableAmount: true,
      budgetHeader: {
        select: {
          id: true,
          totalAmount: true,
          responsibilityCenter: { select: { id: true, code: true, name: true } },
          fundSource: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  budgetLine: {
    select: { id: true, accountCode: true, description: true, amount: true },
  },
  fiscalYear: {
    select: { id: true, year: true, name: true },
  },
  fundSource: {
    select: { id: true, code: true, name: true },
  },
  responsibilityCenter: {
    select: { id: true, code: true, name: true },
  },
  certifier: {
    select: { id: true, username: true },
  },
  creator: {
    select: { id: true, username: true },
  },
} as const;

@Injectable()
export class CafService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetCalculation: BudgetCalculationService,
  ) {}

  async findAll(organizationId: string, filters?: { status?: string; purchaseRequestId?: string; purchaseOrderId?: string }) {
    return this.prisma.certificationOfAvailability.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.purchaseRequestId ? { purchaseRequestId: filters.purchaseRequestId } : {}),
        ...(filters?.purchaseOrderId ? { purchaseOrderId: filters.purchaseOrderId } : {}),
      },
      select: CAF_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const caf = await this.prisma.certificationOfAvailability.findFirst({
      where: { id, organizationId },
      select: CAF_SELECT,
    });
    if (!caf) throw new NotFoundException('CAF not found.');
    return caf;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      purchaseRequestId: string;
      purchaseOrderId?: string;
      budgetReleaseId: string;
      budgetReservationId?: string;
      budgetLineId?: string;
      certifiedAmount: number;
      accountCode?: string;
      remarks?: string;
    },
  ) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id: data.purchaseRequestId, organizationId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found.');

    const release = await this.prisma.budgetRelease.findFirst({
      where: { id: data.budgetReleaseId, organizationId },
      include: {
        budgetHeader: {
          select: {
            responsibilityCenterId: true,
            fundSourceId: true,
            budgetVersion: {
              select: { budgetCycle: { select: { fiscalYearId: true } } },
            },
          },
        },
      },
    });
    if (!release) throw new NotFoundException('Budget release not found.');

    if (data.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: data.purchaseOrderId, organizationId, purchaseRequestId: data.purchaseRequestId },
      });
      if (!po) throw new NotFoundException('Purchase order not found or does not belong to this PR.');
    }

    const existingActive = await this.prisma.certificationOfAvailability.findFirst({
      where: {
        purchaseRequestId: data.purchaseRequestId,
        status: { in: ['draft', 'for_certification', 'certified'] },
      },
    });
    if (existingActive) {
      throw new ConflictException('An active CAF already exists for this purchase request.');
    }

    const summary = await this.budgetCalculation.getReleaseSummary(organizationId, data.budgetReleaseId);
    const certifiedAmount = new Prisma.Decimal(data.certifiedAmount);
    const availableBefore = summary.availableAmount;
    const availableAfter = availableBefore.minus(certifiedAmount);

    const fiscalYearId = pr.fiscalYearId
      ?? release.budgetHeader.budgetVersion.budgetCycle.fiscalYearId;
    if (!fiscalYearId) throw new BadRequestException('Cannot determine fiscal year.');

    const responsibilityCenterId = pr.responsibilityCenterId
      ?? release.budgetHeader.responsibilityCenterId;
    if (!responsibilityCenterId) throw new BadRequestException('Cannot determine responsibility center.');

    const fundSourceId = pr.fundSourceId
      ?? release.budgetHeader.fundSourceId;
    if (!fundSourceId) throw new BadRequestException('Cannot determine fund source.');

    const cafNumber = await this.generateCafNumber(organizationId);

    return runAudited(this.prisma, userId, (tx) =>
      tx.certificationOfAvailability.create({
        data: {
          organizationId,
          cafNumber,
          purchaseRequestId: data.purchaseRequestId,
          ...(data.purchaseOrderId ? { purchaseOrderId: data.purchaseOrderId } : {}),
          budgetReleaseId: data.budgetReleaseId,
          ...(data.budgetReservationId ? { budgetReservationId: data.budgetReservationId } : {}),
          ...(data.budgetLineId ? { budgetLineId: data.budgetLineId } : {}),
          fiscalYearId,
          fundSourceId,
          responsibilityCenterId,
          ...(data.accountCode ? { accountCode: data.accountCode } : {}),
          certifiedAmount,
          availableBefore,
          availableAfter,
          ...(data.remarks ? { remarks: data.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: CAF_SELECT,
      }),
    );
  }

  async submitForCertification(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const caf = await this.prisma.certificationOfAvailability.findFirst({
      where: { id, organizationId },
    });
    if (!caf) throw new NotFoundException('CAF not found.');
    if (caf.status !== 'draft') {
      throw new BadRequestException('Only draft CAFs can be submitted for certification.');
    }
    if (caf.version !== expectedVersion) {
      throw new ConflictException('CAF was modified by another user.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.certificationOfAvailability.update({
        where: { id },
        data: {
          status: 'for_certification',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CAF_SELECT,
      }),
    );
  }

  async certify(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const caf = await this.prisma.certificationOfAvailability.findFirst({
      where: { id, organizationId },
    });
    if (!caf) throw new NotFoundException('CAF not found.');
    if (caf.status !== 'for_certification') {
      throw new BadRequestException('CAF is not pending certification.');
    }
    if (caf.version !== expectedVersion) {
      throw new ConflictException('CAF was modified by another user.');
    }

    const summary = await this.budgetCalculation.getReleaseSummary(organizationId, caf.budgetReleaseId);
    if (summary.availableAmount.lessThan(caf.certifiedAmount)) {
      throw new BadRequestException(
        `Insufficient budget: available ${summary.availableAmount.toFixed(2)}, ` +
        `requested ${caf.certifiedAmount.toFixed(2)}`,
      );
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const result = await tx.certificationOfAvailability.update({
        where: { id },
        data: {
          status: 'certified',
          certifiedBy: userId,
          certifiedAt: new Date(),
          certificationDate: new Date(),
          availableBefore: summary.availableAmount,
          availableAfter: summary.availableAmount.minus(caf.certifiedAmount),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CAF_SELECT,
      });

      if (caf.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: caf.purchaseOrderId } });
        if (po && po.status === 'pending_caf') {
          await tx.purchaseOrder.update({
            where: { id: caf.purchaseOrderId },
            data: { status: 'for_approval', updatedBy: userId },
          });
        }
      }

      return result;
    });
  }

  async reject(organizationId: string, id: string, userId: string, expectedVersion: number, remarks?: string) {
    const caf = await this.prisma.certificationOfAvailability.findFirst({
      where: { id, organizationId },
    });
    if (!caf) throw new NotFoundException('CAF not found.');
    if (caf.status !== 'for_certification') {
      throw new BadRequestException('Only CAFs pending certification can be rejected.');
    }
    if (caf.version !== expectedVersion) {
      throw new ConflictException('CAF was modified by another user.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.certificationOfAvailability.update({
        where: { id },
        data: {
          status: 'rejected',
          ...(remarks ? { remarks } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CAF_SELECT,
      }),
    );
  }

  async cancel(organizationId: string, id: string, userId: string, expectedVersion: number, remarks?: string) {
    const caf = await this.prisma.certificationOfAvailability.findFirst({
      where: { id, organizationId },
    });
    if (!caf) throw new NotFoundException('CAF not found.');
    if (caf.status === 'cancelled' || caf.status === 'superseded') {
      throw new BadRequestException('CAF is already cancelled or superseded.');
    }
    if (caf.version !== expectedVersion) {
      throw new ConflictException('CAF was modified by another user.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const result = await tx.certificationOfAvailability.update({
        where: { id },
        data: {
          status: 'cancelled',
          ...(remarks ? { remarks } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: CAF_SELECT,
      });

      if (caf.purchaseOrderId && caf.status === 'certified') {
        const po = await tx.purchaseOrder.findUnique({ where: { id: caf.purchaseOrderId } });
        if (po && po.status === 'for_approval') {
          await tx.purchaseOrder.update({
            where: { id: caf.purchaseOrderId },
            data: { status: 'pending_caf', updatedBy: userId },
          });
        }
      }

      return result;
    });
  }

  private async generateCafNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'CAF'
        AND fiscal_year_id IS NULL
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `CAF-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'CAF', 'CAF-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate CAF number from document_sequences.');
    return `CAF-${String(Number(row.next_number)).padStart(6, '0')}`;
  }
}
