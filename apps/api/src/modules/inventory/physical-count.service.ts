import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CountType, PropertyCondition } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const COUNT_SELECT = {
  id: true,
  countNumber: true,
  countDate: true,
  countType: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  fiscalYear: { select: { id: true, year: true } },
  counter: { select: { username: true } },
  verifier: { select: { username: true } },
  approver: { select: { username: true } },
  creator: { select: { username: true } },
  items: {
    select: {
      id: true,
      onHandPerCount: true,
      onHandPerCard: true,
      quantityVariance: true,
      unitCost: true,
      totalVarianceCost: true,
      condition: true,
      remarks: true,
      inventoryItem: { select: { id: true, itemCode: true, description: true, unitOfMeasure: true } },
      propertyRecord: { select: { id: true, propertyNumber: true, description: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class PhysicalCountService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { status?: string; countType?: string }) {
    return this.prisma.physicalCount.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.countType ? { countType: filters.countType as CountType } : {}),
      },
      select: {
        id: true,
        countNumber: true,
        countDate: true,
        countType: true,
        status: true,
        createdAt: true,
        counter: { select: { username: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id, organizationId },
      select: COUNT_SELECT,
    });
    if (!count) throw new NotFoundException('Physical count not found.');
    return count;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      countDate: string;
      countType: string;
      fiscalYearId?: string;
      remarks?: string;
      items: Array<{
        inventoryItemId: string;
        propertyRecordId?: string;
        onHandPerCount: number;
        onHandPerCard: number;
        unitCost: number;
        condition?: string;
        remarks?: string;
      }>;
    },
  ) {
    return runAudited(this.prisma, userId, async (tx) => {
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = 'physical_count'
        RETURNING next_number
      `;
      const countNumber = `PC-${String(seq.next_number).padStart(6, '0')}`;

      const itemsData = data.items.map((item) => {
        const variance = item.onHandPerCount - item.onHandPerCard;
        return {
          inventoryItemId: item.inventoryItemId,
          ...(item.propertyRecordId ? { propertyRecordId: item.propertyRecordId } : {}),
          onHandPerCount: item.onHandPerCount,
          onHandPerCard: item.onHandPerCard,
          quantityVariance: variance,
          unitCost: item.unitCost,
          totalVarianceCost: variance * item.unitCost,
          ...(item.condition ? { condition: item.condition as PropertyCondition } : {}),
          ...(item.remarks ? { remarks: item.remarks } : {}),
        };
      });

      return tx.physicalCount.create({
        data: {
          organizationId,
          countNumber,
          countDate: new Date(data.countDate),
          countType: data.countType as CountType,
          ...(data.fiscalYearId ? { fiscalYearId: data.fiscalYearId } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          countedBy: userId,
          createdBy: userId,
          updatedBy: userId,
          items: { createMany: { data: itemsData } },
        },
        select: COUNT_SELECT,
      });
    });
  }

  async submit(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id, organizationId },
    });
    if (!count) throw new NotFoundException('Physical count not found.');
    if (count.status !== 'draft') throw new BadRequestException('Only draft counts can be submitted.');
    if (count.version !== expectedVersion) {
      throw new ConflictException('Count was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.physicalCount.update({
        where: { id },
        data: {
          status: 'in_progress',
          verifiedBy: userId,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: COUNT_SELECT,
      }),
    );
  }

  async complete(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id, organizationId },
    });
    if (!count) throw new NotFoundException('Physical count not found.');
    if (count.status !== 'in_progress') throw new BadRequestException('Only in-progress counts can be completed.');
    if (count.version !== expectedVersion) {
      throw new ConflictException('Count was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.physicalCount.update({
        where: { id },
        data: {
          status: 'completed',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: COUNT_SELECT,
      }),
    );
  }

  async approve(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!count) throw new NotFoundException('Physical count not found.');
    if (count.status !== 'completed') throw new BadRequestException('Only completed counts can be approved.');
    if (count.version !== expectedVersion) {
      throw new ConflictException('Count was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      for (const item of count.items) {
        const variance = Number(item.quantityVariance);
        if (variance === 0) continue;

        const stockCard = await tx.stockCard.findUnique({
          where: { inventoryItemId: item.inventoryItemId },
        });
        if (!stockCard) continue;

        const currentQty = Number(stockCard.balanceQuantity);
        const unitCost = Number(stockCard.balanceUnitCost);
        const newQty = currentQty + variance;
        const newTotalCost = newQty * unitCost;

        await tx.stockCardEntry.create({
          data: {
            stockCardId: stockCard.id,
            entryDate: count.countDate,
            entryType: 'adjustment',
            referenceType: 'physical_count',
            referenceId: count.id,
            referenceNumber: count.countNumber,
            ...(variance > 0
              ? { receiptQuantity: variance, receiptUnitCost: unitCost, receiptTotalCost: variance * unitCost }
              : { issueQuantity: Math.abs(variance), issueUnitCost: unitCost, issueTotalCost: Math.abs(variance) * unitCost }),
            balanceQuantity: newQty,
            balanceUnitCost: unitCost,
            balanceTotalCost: newTotalCost,
            createdBy: userId,
          },
        });

        await tx.stockCard.update({
          where: { id: stockCard.id },
          data: { balanceQuantity: newQty, balanceTotalCost: newTotalCost },
        });

        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { onHandQuantity: newQty, updatedBy: userId, version: { increment: 1 } },
        });
      }

      return tx.physicalCount.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: COUNT_SELECT,
      });
    });
  }
}
