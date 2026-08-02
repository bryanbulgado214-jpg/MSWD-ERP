import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const RIS_SELECT = {
  id: true,
  risNumber: true,
  risDate: true,
  purpose: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  requestingDepartment: { select: { id: true, name: true } },
  requester: { select: { username: true } },
  approver: { select: { username: true } },
  issuer: { select: { username: true } },
  creator: { select: { username: true } },
  items: {
    select: {
      id: true,
      inventoryItemId: true,
      stockNumber: true,
      description: true,
      unitOfMeasure: true,
      quantityRequested: true,
      quantityIssued: true,
      unitCost: true,
      remarks: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class RisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  async findAll(organizationId: string, filters?: { status?: string; departmentId?: string }) {
    return this.prisma.requisitionIssueSlip.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.departmentId ? { requestingDepartmentId: filters.departmentId } : {}),
      },
      select: {
        id: true,
        risNumber: true,
        risDate: true,
        purpose: true,
        status: true,
        createdAt: true,
        requestingDepartment: { select: { id: true, name: true } },
        requester: { select: { username: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const ris = await this.prisma.requisitionIssueSlip.findFirst({
      where: { id, organizationId },
      select: RIS_SELECT,
    });
    if (!ris) throw new NotFoundException('RIS not found.');
    return ris;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      risDate: string;
      requestingDepartmentId: string;
      purpose?: string;
      remarks?: string;
      items: Array<{ inventoryItemId: string; quantityRequested: number; remarks?: string }>;
    },
  ) {
    return runAudited(this.prisma, userId, async (tx) => {
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = 'ris'
        RETURNING next_number
      `;
      const risNumber = `RIS-${String(seq.next_number).padStart(6, '0')}`;

      const inventoryItems = await tx.inventoryItem.findMany({
        where: {
          id: { in: data.items.map((i) => i.inventoryItemId) },
          organizationId,
        },
        select: { id: true, itemCode: true, description: true, unitOfMeasure: true, unitCost: true },
      });
      const itemMap = new Map(inventoryItems.map((i) => [i.id, i]));

      const itemsData = data.items.map((item) => {
        const inv = itemMap.get(item.inventoryItemId);
        if (!inv) throw new BadRequestException(`Inventory item not found: ${item.inventoryItemId}`);
        return {
          inventoryItemId: item.inventoryItemId,
          stockNumber: inv.itemCode,
          description: inv.description,
          unitOfMeasure: inv.unitOfMeasure,
          quantityRequested: item.quantityRequested,
          unitCost: Number(inv.unitCost),
          ...(item.remarks ? { remarks: item.remarks } : {}),
        };
      });

      return tx.requisitionIssueSlip.create({
        data: {
          organizationId,
          risNumber,
          risDate: new Date(data.risDate),
          requestingDepartmentId: data.requestingDepartmentId,
          ...(data.purpose ? { purpose: data.purpose } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          requestedBy: userId,
          createdBy: userId,
          updatedBy: userId,
          items: { createMany: { data: itemsData } },
        },
        select: RIS_SELECT,
      });
    });
  }

  async submit(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const ris = await this.prisma.requisitionIssueSlip.findFirst({
      where: { id, organizationId },
    });
    if (!ris) throw new NotFoundException('RIS not found.');
    if (ris.status !== 'draft') throw new BadRequestException('Only draft RIS can be submitted.');
    if (ris.version !== expectedVersion) {
      throw new ConflictException('RIS was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.requisitionIssueSlip.update({
        where: { id },
        data: { status: 'submitted', updatedBy: userId, version: { increment: 1 } },
        select: RIS_SELECT,
      }),
    );
  }

  async approve(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const ris = await this.prisma.requisitionIssueSlip.findFirst({
      where: { id, organizationId },
    });
    if (!ris) throw new NotFoundException('RIS not found.');
    if (ris.status !== 'submitted') throw new BadRequestException('Only submitted RIS can be approved.');
    if (ris.version !== expectedVersion) {
      throw new ConflictException('RIS was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.requisitionIssueSlip.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RIS_SELECT,
      }),
    );
  }

  async issue(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
    items: Array<{ risItemId: string; quantityIssued: number }>,
  ) {
    const ris = await this.prisma.requisitionIssueSlip.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!ris) throw new NotFoundException('RIS not found.');
    if (ris.status !== 'approved' && ris.status !== 'partially_issued') {
      throw new BadRequestException('Only approved or partially-issued RIS can be issued.');
    }
    if (ris.version !== expectedVersion) {
      throw new ConflictException('RIS was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      for (const issueItem of items) {
        const risItem = ris.items.find((i) => i.id === issueItem.risItemId);
        if (!risItem) throw new BadRequestException(`RIS item not found: ${issueItem.risItemId}`);

        const alreadyIssued = Number(risItem.quantityIssued);
        const requested = Number(risItem.quantityRequested);
        const toIssue = issueItem.quantityIssued;

        if (toIssue <= 0) throw new BadRequestException('Issue quantity must be positive.');
        if (alreadyIssued + toIssue > requested) {
          throw new BadRequestException(
            `Cannot issue ${toIssue} of "${risItem.description}". Already issued: ${alreadyIssued}, requested: ${requested}.`,
          );
        }

        const stockCard = await tx.stockCard.findUnique({
          where: { inventoryItemId: risItem.inventoryItemId },
        });
        if (!stockCard) throw new BadRequestException(`No stock card for item ${risItem.stockNumber}.`);

        const currentQty = Number(stockCard.balanceQuantity);
        if (toIssue > currentQty) {
          throw new BadRequestException(
            `Insufficient stock for "${risItem.description}". Available: ${currentQty}, requested: ${toIssue}.`,
          );
        }

        const unitCost = Number(stockCard.balanceUnitCost);
        const issueTotalCost = toIssue * unitCost;
        const newQty = currentQty - toIssue;
        const newTotalCost = Number(stockCard.balanceTotalCost) - issueTotalCost;
        const newUnitCost = newQty > 0 ? newTotalCost / newQty : 0;

        await tx.stockCardEntry.create({
          data: {
            stockCardId: stockCard.id,
            entryDate: new Date(),
            entryType: 'issue',
            referenceType: 'ris',
            referenceId: ris.id,
            referenceNumber: ris.risNumber,
            issueQuantity: toIssue,
            issueUnitCost: unitCost,
            issueTotalCost: issueTotalCost,
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
          where: { id: risItem.inventoryItemId },
          data: {
            onHandQuantity: newQty,
            unitCost: newUnitCost,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });

        await tx.risItem.update({
          where: { id: risItem.id },
          data: { quantityIssued: alreadyIssued + toIssue },
        });
      }

      await this.autoJev.onRisIssued(tx, organizationId, userId, {
        id: ris.id,
        risNumber: ris.risNumber,
        issuedItems: items.map((issueItem) => {
          const risItem = ris.items.find((i) => i.id === issueItem.risItemId)!;
          return {
            description: risItem.description,
            quantityIssued: issueItem.quantityIssued,
            unitCost: Number(risItem.unitCost),
          };
        }),
      });

      const updatedItems = await tx.risItem.findMany({ where: { risId: id } });
      const allFullyIssued = updatedItems.every(
        (i) => Number(i.quantityIssued) >= Number(i.quantityRequested),
      );

      return tx.requisitionIssueSlip.update({
        where: { id },
        data: {
          status: allFullyIssued ? 'issued' : 'partially_issued',
          issuedBy: userId,
          issuedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RIS_SELECT,
      });
    });
  }

  async cancel(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const ris = await this.prisma.requisitionIssueSlip.findFirst({
      where: { id, organizationId },
    });
    if (!ris) throw new NotFoundException('RIS not found.');
    if (ris.status === 'issued' || ris.status === 'cancelled') {
      throw new BadRequestException('Cannot cancel a fully issued or already cancelled RIS.');
    }
    if (ris.version !== expectedVersion) {
      throw new ConflictException('RIS was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.requisitionIssueSlip.update({
        where: { id },
        data: { status: 'cancelled', updatedBy: userId, version: { increment: 1 } },
        select: RIS_SELECT,
      }),
    );
  }
}
