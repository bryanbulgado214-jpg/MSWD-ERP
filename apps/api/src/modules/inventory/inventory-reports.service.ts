import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStockCardReport(organizationId: string, inventoryItemId: string) {
    const stockCard = await this.prisma.stockCard.findFirst({
      where: { inventoryItemId, organization: { id: organizationId } },
      select: {
        id: true,
        stockNumber: true,
        description: true,
        reorderPoint: true,
        unitOfMeasure: true,
        balanceQuantity: true,
        balanceUnitCost: true,
        balanceTotalCost: true,
        inventoryItem: {
          select: { itemCode: true, classification: true, category: true, accountCode: true },
        },
        entries: {
          select: {
            id: true,
            entryDate: true,
            entryType: true,
            referenceType: true,
            referenceNumber: true,
            receiptQuantity: true,
            receiptUnitCost: true,
            receiptTotalCost: true,
            issueQuantity: true,
            issueUnitCost: true,
            issueTotalCost: true,
            balanceQuantity: true,
            balanceUnitCost: true,
            balanceTotalCost: true,
            createdAt: true,
          },
          orderBy: { entryDate: 'asc' },
        },
      },
    });
    return stockCard;
  }

  async getRsmi(organizationId: string, startDate: string, endDate: string) {
    const entries = await this.prisma.stockCardEntry.findMany({
      where: {
        entryType: 'issue',
        entryDate: { gte: new Date(startDate), lte: new Date(endDate) },
        stockCard: { organization: { id: organizationId } },
      },
      select: {
        id: true,
        entryDate: true,
        referenceNumber: true,
        issueQuantity: true,
        issueUnitCost: true,
        issueTotalCost: true,
        stockCard: {
          select: {
            stockNumber: true,
            description: true,
            unitOfMeasure: true,
            inventoryItem: { select: { classification: true, category: true, accountCode: true } },
          },
        },
      },
      orderBy: { entryDate: 'asc' },
    });
    return entries;
  }

  async getRpci(organizationId: string, physicalCountId: string) {
    const count = await this.prisma.physicalCount.findFirst({
      where: { id: physicalCountId, organizationId },
      select: {
        id: true,
        countNumber: true,
        countDate: true,
        countType: true,
        status: true,
        counter: { select: { username: true } },
        verifier: { select: { username: true } },
        approver: { select: { username: true } },
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
            inventoryItem: {
              select: {
                itemCode: true,
                description: true,
                unitOfMeasure: true,
                classification: true,
                accountCode: true,
              },
            },
            propertyRecord: {
              select: { propertyNumber: true, description: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return count;
  }

  async getPropertyLedger(organizationId: string, filters?: { classification?: string; accountableUserId?: string }) {
    return this.prisma.propertyRecord.findMany({
      where: {
        organizationId,
        isDisposed: false,
        ...(filters?.accountableUserId ? { accountableUserId: filters.accountableUserId } : {}),
        ...(filters?.classification
          ? { inventoryItem: { classification: filters.classification as any } }
          : {}),
      },
      select: {
        id: true,
        propertyNumber: true,
        serialNumber: true,
        description: true,
        dateAcquired: true,
        acquisitionCost: true,
        accumulatedDepreciation: true,
        bookValue: true,
        condition: true,
        inventoryItem: { select: { itemCode: true, classification: true, accountCode: true } },
        location: { select: { name: true } },
        accountableUser: { select: { username: true } },
      },
      orderBy: { propertyNumber: 'asc' },
    });
  }

  async getInventorySummary(organizationId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        itemCode: true,
        description: true,
        classification: true,
        unitOfMeasure: true,
        onHandQuantity: true,
        unitCost: true,
        reorderPoint: true,
      },
      orderBy: { itemCode: 'asc' },
    });

    const summary = {
      totalItems: items.length,
      expendable: items.filter((i) => i.classification === 'expendable'),
      semiExpendable: items.filter((i) => i.classification === 'semi_expendable'),
      ppe: items.filter((i) => i.classification === 'ppe'),
      belowReorderPoint: items.filter(
        (i) => Number(i.reorderPoint) > 0 && Number(i.onHandQuantity) <= Number(i.reorderPoint),
      ),
    };
    return summary;
  }
}
