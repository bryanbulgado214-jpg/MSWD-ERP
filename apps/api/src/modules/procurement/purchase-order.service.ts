import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const PO_SELECT = {
  id: true,
  poNumber: true,
  poDate: true,
  contractAmount: true,
  awardDate: true,
  awardNoticeNumber: true,
  modeOfProcurement: true,
  deliveryTerms: true,
  paymentTerms: true,
  status: true,
  remarks: true,
  approvedAt: true,
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
    },
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tin: true,
      address: true,
    },
  },
  approver: {
    select: { id: true, username: true },
  },
  creator: {
    select: { id: true, username: true },
  },
} as const;

@Injectable()
export class PurchaseOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { status?: string; purchaseRequestId?: string }) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.purchaseRequestId ? { purchaseRequestId: filters.purchaseRequestId } : {}),
      },
      select: PO_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      select: PO_SELECT,
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    return po;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      poNumber?: string;
      purchaseRequestId: string;
      supplierId?: string;
      payeeId?: string;
      poDate: string;
      contractAmount: number;
      awardDate?: string;
      awardNoticeNumber?: string;
      modeOfProcurement?: string;
      deliveryTerms?: string;
      paymentTerms?: string;
      remarks?: string;
    },
  ) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id: data.purchaseRequestId, organizationId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found.');
    if (pr.status !== 'procurement_in_progress' && pr.status !== 'awarded') {
      throw new BadRequestException('Purchase request is not in a valid status for PO creation.');
    }

    const existingPo = await this.prisma.purchaseOrder.findFirst({
      where: { purchaseRequestId: data.purchaseRequestId, status: { not: 'cancelled' } },
    });
    if (existingPo) throw new ConflictException('An active purchase order already exists for this PR.');

    let poNumber: string;
    if (data.poNumber?.trim()) {
      poNumber = data.poNumber.trim();
      await this.assertPoNumberAvailable(organizationId, poNumber);
    } else {
      poNumber = await this.generatePoNumber(organizationId);
    }

    return runAudited(this.prisma, userId, async (tx) => {
      // The dropdown offers the shared supplier (payee) master; bridge the chosen
      // payee to a Supplier record (the PO's FK) — reused by name, created if new.
      const supplierId = await this.resolveSupplierId(
        tx,
        organizationId,
        userId,
        data.supplierId,
        data.payeeId,
      );

      const po = await tx.purchaseOrder.create({
        data: {
          organizationId,
          poNumber,
          poDate: new Date(data.poDate),
          purchaseRequestId: data.purchaseRequestId,
          supplierId,
          contractAmount: new Prisma.Decimal(data.contractAmount),
          ...(data.awardDate ? { awardDate: new Date(data.awardDate) } : {}),
          ...(data.awardNoticeNumber ? { awardNoticeNumber: data.awardNoticeNumber } : {}),
          ...(data.modeOfProcurement ? { modeOfProcurement: data.modeOfProcurement } : {}),
          ...(data.deliveryTerms ? { deliveryTerms: data.deliveryTerms } : {}),
          ...(data.paymentTerms ? { paymentTerms: data.paymentTerms } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: PO_SELECT,
      });

      if (pr.status === 'procurement_in_progress') {
        await tx.purchaseRequest.update({
          where: { id: data.purchaseRequestId },
          data: { status: 'awarded', updatedBy: userId },
        });
      }

      return po;
    });
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      supplierId?: string;
      poDate?: string;
      contractAmount?: number;
      awardDate?: string;
      awardNoticeNumber?: string;
      modeOfProcurement?: string;
      deliveryTerms?: string;
      paymentTerms?: string;
      remarks?: string;
    },
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.status !== 'draft' && po.status !== 'pending_caf') {
      throw new BadRequestException('Purchase order can only be edited in draft or pending_caf status.');
    }
    if (po.version !== data.expectedVersion) {
      throw new ConflictException('Purchase order was modified by another user. Please refresh and try again.');
    }

    if (data.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: data.supplierId, organizationId, isActive: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found or is inactive.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(data.supplierId ? { supplierId: data.supplierId } : {}),
          ...(data.poDate ? { poDate: new Date(data.poDate) } : {}),
          ...(data.contractAmount !== undefined
            ? { contractAmount: new Prisma.Decimal(data.contractAmount) }
            : {}),
          ...(data.awardDate ? { awardDate: new Date(data.awardDate) } : {}),
          ...(data.awardNoticeNumber !== undefined ? { awardNoticeNumber: data.awardNoticeNumber } : {}),
          ...(data.modeOfProcurement !== undefined ? { modeOfProcurement: data.modeOfProcurement } : {}),
          ...(data.deliveryTerms !== undefined ? { deliveryTerms: data.deliveryTerms } : {}),
          ...(data.paymentTerms !== undefined ? { paymentTerms: data.paymentTerms } : {}),
          ...(data.remarks !== undefined ? { remarks: data.remarks } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PO_SELECT,
      }),
    );
  }

  // Change the PO's document number at ANY status (correction / reconciling with
  // an official registry). Gated by a PO management permission at the controller.
  async changeNumber(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
    poNumber: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.version !== expectedVersion) {
      throw new ConflictException('Purchase order was modified by another user. Please refresh and try again.');
    }
    const next = poNumber.trim();
    if (!next) throw new BadRequestException('PO number cannot be blank.');
    if (next === po.poNumber) {
      return this.findOne(organizationId, id);
    }
    await this.assertPoNumberAvailable(organizationId, next, id);
    return runAudited(this.prisma, userId, (tx) =>
      tx.purchaseOrder.update({
        where: { id },
        data: {
          poNumber: next,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PO_SELECT,
      }),
    );
  }

  // Change the PO's date at ANY status (correction / reconciling with a paper
  // record). poDate is a document date only — it drives no accounting — so this
  // is safe post-approval, unlike the DV date.
  async changeDate(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
    poDate: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.version !== expectedVersion) {
      throw new ConflictException('Purchase order was modified by another user. Please refresh and try again.');
    }
    const when = new Date(poDate);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('A valid PO date is required.');
    }
    return runAudited(this.prisma, userId, (tx) =>
      tx.purchaseOrder.update({
        where: { id },
        data: {
          poDate: when,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PO_SELECT,
      }),
    );
  }

  async submitForCaf(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.status !== 'draft') {
      throw new BadRequestException('Only draft purchase orders can be submitted for CAF.');
    }
    if (po.version !== expectedVersion) {
      throw new ConflictException('Purchase order was modified by another user.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'pending_caf',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PO_SELECT,
      }),
    );
  }

  async approve(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.status !== 'for_approval') {
      throw new BadRequestException('Purchase order is not ready for approval.');
    }

    const certifiedCaf = await this.prisma.certificationOfAvailability.findFirst({
      where: { purchaseOrderId: id, status: 'certified' },
    });
    if (!certifiedCaf) {
      throw new BadRequestException('Cannot approve PO without a certified CAF.');
    }
    if (po.version !== expectedVersion) {
      throw new ConflictException('Purchase order was modified by another user.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const result = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PO_SELECT,
      });

      await tx.purchaseRequest.update({
        where: { id: po.purchaseRequestId },
        data: { status: 'po_issued', updatedBy: userId },
      });

      return result;
    });
  }

  async cancel(organizationId: string, id: string, userId: string, expectedVersion: number, remarks?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found.');
    if (po.status === 'cancelled') {
      throw new BadRequestException('Purchase order is already cancelled.');
    }
    if (po.status === 'approved') {
      throw new BadRequestException('Approved purchase orders cannot be cancelled directly.');
    }
    if (po.version !== expectedVersion) {
      throw new ConflictException('Purchase order was modified by another user.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'cancelled',
          ...(remarks ? { remarks } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PO_SELECT,
      }),
    );
  }

  // Resolve the PO's Supplier FK from the chosen supplier (payee) master entry.
  // A direct supplierId is validated and used as-is; otherwise the payee is
  // mirrored into a Supplier row — reused by its (org, name) unique key so the
  // same supplier never duplicates, created on first use.
  private async resolveSupplierId(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    supplierId?: string,
    payeeId?: string,
  ): Promise<string> {
    if (supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found or is inactive.');
      return supplier.id;
    }
    if (!payeeId) {
      throw new BadRequestException('Select a supplier for the purchase order.');
    }
    const payee = await tx.payee.findFirst({
      where: { id: payeeId, organizationId, mergedIntoId: null },
      select: { name: true, tin: true, address: true },
    });
    if (!payee) throw new NotFoundException('Supplier not found.');

    const existing = await tx.supplier.findFirst({
      where: { organizationId, name: payee.name },
      select: { id: true, isActive: true },
    });
    if (existing) {
      if (!existing.isActive) {
        await tx.supplier.update({
          where: { id: existing.id },
          data: { isActive: true, updatedBy: userId },
        });
      }
      return existing.id;
    }
    const created = await tx.supplier.create({
      data: {
        organizationId,
        name: payee.name,
        ...(payee.tin ? { tin: payee.tin } : {}),
        ...(payee.address ? { address: payee.address } : {}),
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true },
    });
    return created.id;
  }

  // Enforce the per-organization uniqueness of a PO number before we rely on the
  // DB constraint, so the officer gets a clear message instead of a raw error.
  private async assertPoNumberAvailable(
    organizationId: string,
    poNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.purchaseOrder.findFirst({
      where: {
        organizationId,
        poNumber,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`PO number "${poNumber}" is already in use.`);
    }
  }

  private async generatePoNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'PURCHASE_ORDER'
        AND fiscal_year_id IS NULL
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `PO-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'PURCHASE_ORDER', 'PO-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate PO number from document_sequences.');
    return `PO-${String(Number(row.next_number)).padStart(6, '0')}`;
  }
}
