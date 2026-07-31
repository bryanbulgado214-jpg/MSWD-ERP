import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

export interface CreatePpmpItemInput {
  fiscalYearId: string;
  departmentId: string;
  assignedUserId?: string;
  code: string;
  itemDescription: string;
  procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  unitOfMeasure: string;
  quantity: number | string;
  estimatedUnitCost: number | string;
  modeOfProcurement?: string;
  scheduleQuarter?: number;
  cboNotes?: string;
  createdBy?: string;
}

export interface UpdatePpmpItemInput {
  assignedUserId?: string | null;
  itemDescription?: string;
  procurementCategory?: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  unitOfMeasure?: string;
  quantity?: number | string;
  estimatedUnitCost?: number | string;
  modeOfProcurement?: string | null;
  scheduleQuarter?: number | null;
  cboNotes?: string | null;
  updatedBy?: string;
}

@Injectable()
export class PpmpService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreatePpmpItemInput) {
    const qty = new Prisma.Decimal(input.quantity);
    const unitCost = new Prisma.Decimal(input.estimatedUnitCost);
    const totalCost = qty.mul(unitCost);

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.ppmpItem.create({
        data: {
          organizationId,
          fiscalYearId: input.fiscalYearId,
          departmentId: input.departmentId,
          ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
          code: input.code,
          itemDescription: input.itemDescription,
          procurementCategory: input.procurementCategory,
          unitOfMeasure: input.unitOfMeasure,
          quantity: qty,
          estimatedUnitCost: unitCost,
          estimatedTotalCost: totalCost,
          ...(input.modeOfProcurement ? { modeOfProcurement: input.modeOfProcurement } : {}),
          ...(input.scheduleQuarter != null ? { scheduleQuarter: input.scheduleQuarter } : {}),
          ...(input.cboNotes ? { cboNotes: input.cboNotes } : {}),
          createdBy: input.createdBy ?? null,
        },
        include: {
          department: { select: { id: true, code: true, name: true } },
          assignedUser: { select: { id: true, username: true, email: true } },
        },
      }),
    );
  }

  async update(organizationId: string, id: string, input: UpdatePpmpItemInput) {
    const item = await this.prisma.ppmpItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(`PPMP item ${id} not found.`);
    if (item.status !== 'draft') {
      throw new BadRequestException(`Cannot update PPMP item in "${item.status}" status.`);
    }

    const updates: Prisma.PpmpItemUncheckedUpdateInput = {};

    if (input.updatedBy) updates.updatedBy = input.updatedBy;
    if (input.assignedUserId !== undefined) updates.assignedUserId = input.assignedUserId;
    if (input.itemDescription !== undefined) updates.itemDescription = input.itemDescription;
    if (input.procurementCategory !== undefined) updates.procurementCategory = input.procurementCategory;
    if (input.unitOfMeasure !== undefined) updates.unitOfMeasure = input.unitOfMeasure;
    if (input.modeOfProcurement !== undefined) updates.modeOfProcurement = input.modeOfProcurement;
    if (input.scheduleQuarter !== undefined) updates.scheduleQuarter = input.scheduleQuarter;
    if (input.cboNotes !== undefined) updates.cboNotes = input.cboNotes;

    if (input.quantity !== undefined || input.estimatedUnitCost !== undefined) {
      const qty = input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : item.quantity;
      const unitCost = input.estimatedUnitCost !== undefined
        ? new Prisma.Decimal(input.estimatedUnitCost)
        : item.estimatedUnitCost;
      updates.quantity = qty;
      updates.estimatedUnitCost = unitCost;
      updates.estimatedTotalCost = qty.mul(unitCost);
    }

    return runAudited(this.prisma, input.updatedBy, (tx) =>
      tx.ppmpItem.update({
        where: { id },
        data: updates,
        include: {
          department: { select: { id: true, code: true, name: true } },
          assignedUser: { select: { id: true, username: true, email: true } },
        },
      }),
    );
  }

  async findAll(organizationId: string, filters?: {
    fiscalYearId?: string;
    departmentId?: string;
    assignedUserId?: string;
    status?: string;
  }) {
    return this.prisma.ppmpItem.findMany({
      where: {
        organizationId,
        ...(filters?.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
        ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters?.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters?.status ? { status: filters.status as 'draft' | 'approved' | 'cancelled' } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
        assignedUser: { select: { id: true, username: true, email: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findMyItems(organizationId: string, userId: string, fiscalYearId?: string) {
    const items = await this.prisma.ppmpItem.findMany({
      where: {
        organizationId,
        assignedUserId: userId,
        status: 'approved',
        ...(fiscalYearId ? { fiscalYearId } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });

    const itemsWithRemaining = await Promise.all(
      items.map(async (item) => {
        const prTotals = await this.prisma.purchaseRequest.aggregate({
          where: {
            ppmpItemId: item.id,
            organizationId,
            status: { notIn: ['cancelled', 'rejected', 'voided'] },
          },
          _sum: { totalAmount: true },
        });
        const requested = prTotals._sum.totalAmount ?? new Prisma.Decimal(0);
        const prQty = await this.prisma.purchaseRequestItem.aggregate({
          where: {
            purchaseRequest: {
              ppmpItemId: item.id,
              organizationId,
              status: { notIn: ['cancelled', 'rejected', 'voided'] },
            },
          },
          _sum: { quantity: true },
        });
        const usedQty = prQty._sum.quantity ?? new Prisma.Decimal(0);
        return {
          ...item,
          requestedAmount: requested,
          remainingAmount: item.estimatedTotalCost.sub(requested),
          usedQuantity: usedQty,
          remainingQuantity: item.quantity.sub(usedQty),
        };
      }),
    );

    return itemsWithRemaining;
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.ppmpItem.findFirst({
      where: { id, organizationId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
        assignedUser: { select: { id: true, username: true, email: true } },
        appItems: true,
        purchaseRequests: { select: { id: true, prNumber: true, totalAmount: true, status: true } },
      },
    });
    if (!item) throw new NotFoundException(`PPMP item ${id} not found.`);
    return item;
  }

  async approve(organizationId: string, id: string, actorUserId: string) {
    const item = await this.prisma.ppmpItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(`PPMP item ${id} not found.`);
    if (item.status !== 'draft') {
      throw new BadRequestException(`PPMP item is "${item.status}" and cannot be approved.`);
    }
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.ppmpItem.update({
        where: { id },
        data: { status: 'approved', approvedBy: actorUserId, approvedAt: new Date() },
      }),
    );
  }

  async bulkApprove(organizationId: string, ids: string[], actorUserId: string) {
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.ppmpItem.updateMany({
        where: {
          id: { in: ids },
          organizationId,
          status: 'draft',
        },
        data: { status: 'approved', approvedBy: actorUserId, approvedAt: new Date() },
      }),
    );
  }

  async getRemainingPlannedAmount(organizationId: string, ppmpItemId: string) {
    const item = await this.prisma.ppmpItem.findFirst({
      where: { id: ppmpItemId, organizationId },
    });
    if (!item) throw new NotFoundException(`PPMP item ${ppmpItemId} not found.`);

    const prTotals = await this.prisma.purchaseRequest.aggregate({
      where: {
        ppmpItemId,
        organizationId,
        status: { notIn: ['cancelled', 'rejected', 'voided'] },
      },
      _sum: { totalAmount: true },
    });

    const requested = prTotals._sum.totalAmount ?? new Prisma.Decimal(0);
    const remaining = item.estimatedTotalCost.sub(requested);

    return {
      ppmpItemId,
      estimatedTotalCost: item.estimatedTotalCost,
      requestedAmount: requested,
      remainingPlannedAmount: remaining,
    };
  }
}
