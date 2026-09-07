import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * FIFO cost engine (perpetual). Each receipt / beginning balance / return to
 * stock adds a dated cost layer; issuances consume the oldest remaining layers
 * first. The inventory value of an item is Σ(remainingQuantity × unitCost) over
 * its layers — this is what the Stock Card balances and the Supplies Ledger Card
 * are valued at, and what the month-end issuance JEV credits out.
 */
@Injectable()
export class InventoryCostingService {
  /** Add a FIFO cost layer. */
  async addLayer(
    tx: Tx,
    data: {
      organizationId: string;
      inventoryItemId: string;
      sourceType: 'stock_receipt' | 'beginning_balance' | 'return_entry';
      sourceId?: string | null;
      referenceNumber?: string | null;
      layerDate: Date;
      quantity: number;
      unitCost: number;
      userId: string;
    },
  ) {
    return tx.inventoryCostLayer.create({
      data: {
        organizationId: data.organizationId,
        inventoryItemId: data.inventoryItemId,
        sourceType: data.sourceType,
        sourceId: data.sourceId ?? null,
        referenceNumber: data.referenceNumber ?? null,
        layerDate: data.layerDate,
        originalQuantity: data.quantity,
        remainingQuantity: data.quantity,
        unitCost: data.unitCost,
        createdBy: data.userId,
      },
    });
  }

  /**
   * Consume `quantity` from an item's oldest layers (FIFO), decrementing each
   * layer's remaining quantity. Returns the exact total cost of the consumed
   * quantity (the sum across the layers it spanned). Throws if the layers cannot
   * cover the quantity — which would mean the cost layers have drifted from the
   * stock-card balance and need reconciling.
   */
  async consumeFifo(
    tx: Tx,
    data: { organizationId: string; inventoryItemId: string; quantity: number },
  ): Promise<{ totalCost: number }> {
    let remaining = data.quantity;
    let totalCost = 0;

    const layers = await tx.inventoryCostLayer.findMany({
      where: {
        organizationId: data.organizationId,
        inventoryItemId: data.inventoryItemId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ layerDate: 'asc' }, { createdAt: 'asc' }],
    });

    for (const layer of layers) {
      if (remaining <= 1e-9) break;
      const available = Number(layer.remainingQuantity);
      const take = Math.min(available, remaining);
      totalCost += take * Number(layer.unitCost);
      remaining -= take;
      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: { remainingQuantity: round4(available - take) },
      });
    }

    if (remaining > 1e-6) {
      throw new BadRequestException(
        'FIFO cost layers are inconsistent with the stock balance — please reconcile the stock card before issuing.',
      );
    }

    return { totalCost: round2(totalCost) };
  }

  /** An item's remaining FIFO quantity + peso value (used to refresh balances). */
  async itemValue(
    tx: Tx,
    organizationId: string,
    inventoryItemId: string,
  ): Promise<{ quantity: number; totalCost: number; unitCost: number }> {
    const layers = await tx.inventoryCostLayer.findMany({
      where: { organizationId, inventoryItemId, remainingQuantity: { gt: 0 } },
    });
    let quantity = 0;
    let totalCost = 0;
    for (const l of layers) {
      const q = Number(l.remainingQuantity);
      quantity += q;
      totalCost += q * Number(l.unitCost);
    }
    quantity = round4(quantity);
    totalCost = round2(totalCost);
    return { quantity, totalCost, unitCost: quantity > 0 ? round2(totalCost / quantity) : 0 };
  }
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
