import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const RECEIPT_SELECT = {
  id: true,
  receiptNumber: true,
  receiptDate: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  purchaseOrder: { select: { id: true, poNumber: true } },
  inspectionReport: { select: { id: true, reportNumber: true } },
  supplier: { select: { id: true, name: true } },
  receiver: { select: { username: true } },
  creator: { select: { username: true } },
  items: {
    select: {
      id: true,
      inventoryItem: { select: { id: true, itemCode: true, description: true, unitOfMeasure: true } },
      quantityReceived: true,
      unitCost: true,
      totalCost: true,
      lotNumber: true,
      expiryDate: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class StockReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { status?: string }) {
    return this.prisma.stockReceipt.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as 'draft' | 'received' | 'cancelled' } : {}),
      },
      select: {
        id: true,
        receiptNumber: true,
        receiptDate: true,
        status: true,
        createdAt: true,
        purchaseOrder: { select: { id: true, poNumber: true } },
        supplier: { select: { id: true, name: true } },
        receiver: { select: { username: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { id, organizationId },
      select: RECEIPT_SELECT,
    });
    if (!receipt) throw new NotFoundException('Stock receipt not found.');
    return receipt;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      receiptDate: string;
      purchaseOrderId?: string;
      inspectionReportId?: string;
      supplierId?: string;
      remarks?: string;
      items: Array<{
        inventoryItemId: string;
        quantityReceived: number;
        unitCost: number;
        lotNumber?: string;
        expiryDate?: string;
      }>;
    },
  ) {
    return runAudited(this.prisma, userId, async (tx) => {
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = 'stock_receipt'
        RETURNING next_number
      `;
      const receiptNumber = `SR-${String(seq.next_number).padStart(6, '0')}`;

      const itemsData: Prisma.StockReceiptItemCreateManyStockReceiptInput[] = data.items.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        quantityReceived: item.quantityReceived,
        unitCost: item.unitCost,
        totalCost: item.quantityReceived * item.unitCost,
        ...(item.lotNumber ? { lotNumber: item.lotNumber } : {}),
        ...(item.expiryDate ? { expiryDate: new Date(item.expiryDate) } : {}),
      }));

      return tx.stockReceipt.create({
        data: {
          organizationId,
          receiptNumber,
          receiptDate: new Date(data.receiptDate),
          ...(data.purchaseOrderId ? { purchaseOrderId: data.purchaseOrderId } : {}),
          ...(data.inspectionReportId ? { inspectionReportId: data.inspectionReportId } : {}),
          ...(data.supplierId ? { supplierId: data.supplierId } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          receivedBy: userId,
          createdBy: userId,
          updatedBy: userId,
          items: { createMany: { data: itemsData } },
        },
        select: RECEIPT_SELECT,
      });
    });
  }

  async post(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { id, organizationId },
      include: { items: { include: { inventoryItem: true } } },
    });
    if (!receipt) throw new NotFoundException('Stock receipt not found.');
    if (receipt.status !== 'draft') throw new BadRequestException('Only draft receipts can be posted.');
    if (receipt.version !== expectedVersion) {
      throw new ConflictException('Receipt was modified by another user. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      for (const item of receipt.items) {
        const stockCard = await tx.stockCard.findUnique({
          where: { inventoryItemId: item.inventoryItemId },
        });
        if (!stockCard) throw new BadRequestException(`No stock card found for item ${item.inventoryItem.itemCode}.`);

        const prevBalance = Number(stockCard.balanceTotalCost);
        const prevQty = Number(stockCard.balanceQuantity);
        const recvQty = Number(item.quantityReceived);
        const recvCost = Number(item.totalCost);

        const newQty = prevQty + recvQty;
        const newTotalCost = prevBalance + recvCost;
        const newUnitCost = newQty > 0 ? newTotalCost / newQty : 0;

        await tx.stockCardEntry.create({
          data: {
            stockCardId: stockCard.id,
            entryDate: receipt.receiptDate,
            entryType: 'receipt',
            referenceType: 'stock_receipt',
            referenceId: receipt.id,
            referenceNumber: receipt.receiptNumber,
            receiptQuantity: recvQty,
            receiptUnitCost: Number(item.unitCost),
            receiptTotalCost: recvCost,
            balanceQuantity: newQty,
            balanceUnitCost: newUnitCost,
            balanceTotalCost: newTotalCost,
            createdBy: userId,
          },
        });

        await tx.stockCard.update({
          where: { id: stockCard.id },
          data: {
            balanceQuantity: newQty,
            balanceUnitCost: newUnitCost,
            balanceTotalCost: newTotalCost,
          },
        });

        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            onHandQuantity: newQty,
            unitCost: newUnitCost,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      return tx.stockReceipt.update({
        where: { id },
        data: {
          status: 'received',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RECEIPT_SELECT,
      });
    });
  }

  async cancel(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { id, organizationId },
    });
    if (!receipt) throw new NotFoundException('Stock receipt not found.');
    if (receipt.status !== 'draft') throw new BadRequestException('Only draft receipts can be cancelled.');
    if (receipt.version !== expectedVersion) {
      throw new ConflictException('Receipt was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.stockReceipt.update({
        where: { id },
        data: {
          status: 'cancelled',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RECEIPT_SELECT,
      }),
    );
  }
}
