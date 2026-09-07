import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InventoryClassification } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { InventoryCostingService } from './inventory-costing.service';

const ITEM_SELECT = {
  id: true,
  itemCode: true,
  description: true,
  unitOfMeasure: true,
  classification: true,
  category: true,
  accountCode: true,
  reorderPoint: true,
  unitCost: true,
  onHandQuantity: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

@Injectable()
export class InventoryItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: InventoryCostingService,
  ) {}

  async findAll(
    organizationId: string,
    filters?: {
      classification?: InventoryClassification;
      includeInactive?: boolean;
      search?: string;
    },
  ) {
    return this.prisma.inventoryItem.findMany({
      where: {
        organizationId,
        ...(filters?.classification ? { classification: filters.classification } : {}),
        ...(!filters?.includeInactive ? { isActive: true } : {}),
        ...(filters?.search
          ? {
              OR: [
                { itemCode: { contains: filters.search, mode: 'insensitive' as const } },
                { description: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: ITEM_SELECT,
      orderBy: { itemCode: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId },
      select: {
        ...ITEM_SELECT,
        stockCard: {
          select: {
            id: true,
            balanceQuantity: true,
            balanceUnitCost: true,
            balanceTotalCost: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    return item;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      itemCode: string;
      description: string;
      unitOfMeasure: string;
      classification: InventoryClassification;
      category?: string;
      accountCode?: string;
      reorderPoint?: number;
    },
  ) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { organizationId, itemCode: data.itemCode },
    });
    if (existing) throw new ConflictException('An item with this code already exists.');

    return runAudited(this.prisma, userId, async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          organizationId,
          itemCode: data.itemCode,
          description: data.description,
          unitOfMeasure: data.unitOfMeasure,
          classification: data.classification,
          ...(data.category ? { category: data.category } : {}),
          ...(data.accountCode ? { accountCode: data.accountCode } : {}),
          ...(data.reorderPoint !== undefined ? { reorderPoint: data.reorderPoint } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: ITEM_SELECT,
      });

      await tx.stockCard.create({
        data: {
          organizationId,
          inventoryItemId: item.id,
          stockNumber: data.itemCode,
          description: data.description,
          reorderPoint: data.reorderPoint ?? 0,
          unitOfMeasure: data.unitOfMeasure,
        },
      });

      return item;
    });
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      description?: string;
      unitOfMeasure?: string;
      category?: string;
      accountCode?: string;
      reorderPoint?: number;
      isActive?: boolean;
    },
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId },
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    if (item.version !== data.expectedVersion) {
      throw new ConflictException(
        'Item was modified by another user. Please refresh and try again.',
      );
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id },
        data: {
          ...(data.description ? { description: data.description } : {}),
          ...(data.unitOfMeasure ? { unitOfMeasure: data.unitOfMeasure } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.accountCode !== undefined ? { accountCode: data.accountCode } : {}),
          ...(data.reorderPoint !== undefined ? { reorderPoint: data.reorderPoint } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ITEM_SELECT,
      });

      if (data.description || data.unitOfMeasure || data.reorderPoint !== undefined) {
        await tx.stockCard.updateMany({
          where: { inventoryItemId: id },
          data: {
            ...(data.description ? { description: data.description } : {}),
            ...(data.unitOfMeasure ? { unitOfMeasure: data.unitOfMeasure } : {}),
            ...(data.reorderPoint !== undefined ? { reorderPoint: data.reorderPoint } : {}),
          },
        });
      }

      return updated;
    });
  }

  /**
   * Seed an item's opening stock (quantity + unit cost) as the first FIFO layer.
   * A go-live/setup action for the stock-card personnel — allowed only while the
   * item has no movement yet. No GL entry: the GL Inventory opening balance comes
   * from the accountant's opening trial balance.
   */
  async setBeginningBalance(
    organizationId: string,
    id: string,
    userId: string,
    data: { quantity: number; unitCost: number; asOfDate: string },
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId },
      include: { stockCard: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found.');
    if (!item.stockCard) throw new BadRequestException('Item has no stock card.');
    if (data.quantity <= 0 || data.unitCost < 0) {
      throw new BadRequestException('Quantity must be positive and unit cost non-negative.');
    }
    const movements = await this.prisma.stockCardEntry.count({
      where: { stockCardId: item.stockCard.id },
    });
    if (movements > 0 || Number(item.stockCard.balanceQuantity) !== 0) {
      throw new BadRequestException(
        'A beginning balance can only be set while the item has no stock movements yet.',
      );
    }

    const stockCardId = item.stockCard.id;
    const asOf = new Date(data.asOfDate);
    const totalCost = Math.round(data.quantity * data.unitCost * 100) / 100;

    await runAudited(this.prisma, userId, async (tx) => {
      await this.costing.addLayer(tx, {
        organizationId,
        inventoryItemId: id,
        sourceType: 'beginning_balance',
        sourceId: null,
        referenceNumber: 'BEG-BAL',
        layerDate: asOf,
        quantity: data.quantity,
        unitCost: data.unitCost,
        userId,
      });
      const bal = await this.costing.itemValue(tx, organizationId, id);
      await tx.stockCardEntry.create({
        data: {
          stockCardId,
          entryDate: asOf,
          entryType: 'beginning_balance',
          referenceType: 'beginning_balance',
          referenceNumber: 'BEG-BAL',
          receiptQuantity: data.quantity,
          receiptUnitCost: data.unitCost,
          receiptTotalCost: totalCost,
          balanceQuantity: bal.quantity,
          balanceUnitCost: bal.unitCost,
          balanceTotalCost: bal.totalCost,
          createdBy: userId,
        },
      });
      await tx.stockCard.update({
        where: { id: stockCardId },
        data: {
          balanceQuantity: bal.quantity,
          balanceUnitCost: bal.unitCost,
          balanceTotalCost: bal.totalCost,
        },
      });
      await tx.inventoryItem.update({
        where: { id },
        data: {
          onHandQuantity: bal.quantity,
          unitCost: bal.unitCost,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });

    return this.findOne(organizationId, id);
  }
}
