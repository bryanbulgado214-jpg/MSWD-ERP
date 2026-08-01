import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PropertyCondition } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const PROPERTY_SELECT = {
  id: true,
  propertyNumber: true,
  serialNumber: true,
  description: true,
  dateAcquired: true,
  acquisitionCost: true,
  estimatedUsefulLife: true,
  salvageValue: true,
  monthlyDepreciation: true,
  accumulatedDepreciation: true,
  bookValue: true,
  condition: true,
  isDisposed: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  inventoryItem: { select: { id: true, itemCode: true, description: true, classification: true } },
  location: { select: { id: true, name: true } },
  accountableUser: { select: { id: true, username: true } },
} as const;

@Injectable()
export class PropertyRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { condition?: string; accountableUserId?: string; includeDisposed?: boolean; search?: string },
  ) {
    return this.prisma.propertyRecord.findMany({
      where: {
        organizationId,
        ...(filters?.condition ? { condition: filters.condition as PropertyCondition } : {}),
        ...(filters?.accountableUserId ? { accountableUserId: filters.accountableUserId } : {}),
        ...(!filters?.includeDisposed ? { isDisposed: false } : {}),
        ...(filters?.search
          ? {
              OR: [
                { propertyNumber: { contains: filters.search, mode: 'insensitive' as const } },
                { description: { contains: filters.search, mode: 'insensitive' as const } },
                { serialNumber: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: PROPERTY_SELECT,
      orderBy: { propertyNumber: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.propertyRecord.findFirst({
      where: { id, organizationId },
      select: {
        ...PROPERTY_SELECT,
        stockReceiptItem: {
          select: {
            id: true,
            stockReceipt: { select: { id: true, receiptNumber: true } },
          },
        },
        accountabilityItems: {
          select: {
            id: true,
            quantity: true,
            unitCost: true,
            totalCost: true,
            accountabilityRecord: {
              select: {
                id: true,
                accountabilityNumber: true,
                accountabilityType: true,
                status: true,
                issuedTo: { select: { username: true } },
              },
            },
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Property record not found.');
    return record;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      inventoryItemId: string;
      stockReceiptItemId?: string;
      description: string;
      serialNumber?: string;
      dateAcquired: string;
      acquisitionCost: number;
      estimatedUsefulLife?: number;
      salvageValue?: number;
      condition?: PropertyCondition;
      locationId?: string;
      accountableUserId?: string;
    },
  ) {
    return runAudited(this.prisma, userId, async (tx) => {
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = 'property_record'
        RETURNING next_number
      `;
      const propertyNumber = `PROP-${String(seq.next_number).padStart(6, '0')}`;

      let monthlyDepreciation: number | undefined;
      let bookValue: number | undefined;
      if (data.estimatedUsefulLife && data.estimatedUsefulLife > 0) {
        const salvage = data.salvageValue ?? 0;
        monthlyDepreciation = (data.acquisitionCost - salvage) / (data.estimatedUsefulLife * 12);
        bookValue = data.acquisitionCost;
      }

      return tx.propertyRecord.create({
        data: {
          organizationId,
          inventoryItemId: data.inventoryItemId,
          ...(data.stockReceiptItemId ? { stockReceiptItemId: data.stockReceiptItemId } : {}),
          propertyNumber,
          description: data.description,
          ...(data.serialNumber ? { serialNumber: data.serialNumber } : {}),
          dateAcquired: new Date(data.dateAcquired),
          acquisitionCost: data.acquisitionCost,
          ...(data.estimatedUsefulLife !== undefined ? { estimatedUsefulLife: data.estimatedUsefulLife } : {}),
          ...(data.salvageValue !== undefined ? { salvageValue: data.salvageValue } : {}),
          ...(monthlyDepreciation !== undefined ? { monthlyDepreciation } : {}),
          ...(bookValue !== undefined ? { bookValue } : {}),
          ...(data.condition ? { condition: data.condition } : {}),
          ...(data.locationId ? { locationId: data.locationId } : {}),
          ...(data.accountableUserId ? { accountableUserId: data.accountableUserId } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: PROPERTY_SELECT,
      });
    });
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      serialNumber?: string;
      condition?: PropertyCondition;
      locationId?: string;
      accountableUserId?: string;
      isDisposed?: boolean;
    },
  ) {
    const record = await this.prisma.propertyRecord.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new NotFoundException('Property record not found.');
    if (record.version !== data.expectedVersion) {
      throw new ConflictException('Property record was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.propertyRecord.update({
        where: { id },
        data: {
          ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber } : {}),
          ...(data.condition ? { condition: data.condition } : {}),
          ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
          ...(data.accountableUserId !== undefined ? { accountableUserId: data.accountableUserId } : {}),
          ...(data.isDisposed !== undefined ? { isDisposed: data.isDisposed } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PROPERTY_SELECT,
      }),
    );
  }
}
