import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const REPORT_SELECT = {
  id: true,
  reportNumber: true,
  reportDate: true,
  deliveryDate: true,
  deliveryNote: true,
  invoiceNumber: true,
  invoiceDate: true,
  overallResult: true,
  findings: true,
  recommendations: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  inspectedAt: true,
  acceptedAt: true,
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      contractAmount: true,
      status: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  purchaseRequest: {
    select: { id: true, prNumber: true, title: true, status: true },
  },
  supplier: { select: { id: true, name: true, tin: true } },
  inspector: { select: { id: true, username: true } },
  accepter: { select: { id: true, username: true } },
  creator: { select: { id: true, username: true } },
  items: {
    select: {
      id: true,
      prItemId: true,
      description: true,
      unitOfMeasure: true,
      quantityOrdered: true,
      quantityDelivered: true,
      quantityAccepted: true,
      quantityRejected: true,
      result: true,
      remarks: true,
      itemNumber: true,
    },
    orderBy: { itemNumber: 'asc' as const },
  },
};

interface CreateInspectionDto {
  purchaseOrderId: string;
  deliveryDate: string;
  deliveryNote?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  findings?: string;
  recommendations?: string;
  items: Array<{
    prItemId?: string;
    description: string;
    unitOfMeasure?: string;
    quantityOrdered: number;
    quantityDelivered: number;
    quantityAccepted: number;
    quantityRejected: number;
    result: string;
    remarks?: string;
  }>;
}

@Injectable()
export class InspectionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, filters?: { purchaseOrderId?: string; status?: string }) {
    const where: Prisma.InspectionReportWhereInput = { organizationId: orgId };
    if (filters?.purchaseOrderId) where.purchaseOrderId = filters.purchaseOrderId;
    if (filters?.status) where.status = filters.status as never;

    return this.prisma.inspectionReport.findMany({
      where,
      select: REPORT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const report = await this.prisma.inspectionReport.findFirst({
      where: { id, organizationId: orgId },
      select: REPORT_SELECT,
    });
    if (!report) throw new NotFoundException('Inspection report not found.');
    return report;
  }

  async create(orgId: string, userId: string, data: CreateInspectionDto) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: data.purchaseOrderId, organizationId: orgId },
      include: {
        purchaseRequest: { select: { id: true, status: true } },
        supplier: { select: { id: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase Order not found.');

    const reportNumber = await this.generateReportNumber(orgId);

    return runAudited(this.prisma, userId, (tx) =>
      tx.inspectionReport.create({
        data: {
          organizationId: orgId,
          reportNumber,
          reportDate: new Date(),
          purchaseOrderId: po.id,
          purchaseRequestId: po.purchaseRequest.id,
          supplierId: po.supplier.id,
          deliveryDate: new Date(data.deliveryDate),
          ...(data.deliveryNote ? { deliveryNote: data.deliveryNote } : {}),
          ...(data.invoiceNumber ? { invoiceNumber: data.invoiceNumber } : {}),
          ...(data.invoiceDate ? { invoiceDate: new Date(data.invoiceDate) } : {}),
          ...(data.findings ? { findings: data.findings } : {}),
          ...(data.recommendations ? { recommendations: data.recommendations } : {}),
          overallResult: 'pending',
          status: 'draft',
          createdBy: userId,
          updatedBy: userId,
          items: {
            create: data.items.map((item, idx) => ({
              ...(item.prItemId ? { prItemId: item.prItemId } : {}),
              description: item.description,
              ...(item.unitOfMeasure ? { unitOfMeasure: item.unitOfMeasure } : {}),
              quantityOrdered: item.quantityOrdered,
              quantityDelivered: item.quantityDelivered,
              quantityAccepted: item.quantityAccepted,
              quantityRejected: item.quantityRejected,
              result: item.result,
              ...(item.remarks ? { remarks: item.remarks } : {}),
              itemNumber: idx + 1,
            })),
          },
        },
        select: REPORT_SELECT,
      }),
    );
  }

  async submit(orgId: string, id: string, expectedVersion: number, userId: string) {
    const report = await this.requireReport(orgId, id);
    if (report.status !== 'draft') {
      throw new BadRequestException('Only draft reports can be submitted.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'submitted',
      inspectedBy: userId,
      inspectedAt: new Date(),
      updatedBy: userId,
    }, userId);
  }

  async accept(orgId: string, id: string, expectedVersion: number, userId: string, remarks?: string) {
    const report = await this.requireReport(orgId, id);
    if (report.status !== 'submitted') {
      throw new BadRequestException('Only submitted reports can be accepted.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.inspectionReport.update({
        where: { id, version: expectedVersion },
        data: {
          status: 'accepted',
          overallResult: 'accepted',
          acceptedBy: userId,
          acceptedAt: new Date(),
          updatedBy: userId,
          ...(remarks ? { remarks } : {}),
          version: { increment: 1 },
        },
        select: REPORT_SELECT,
      });

      if (report.purchaseRequest.status === 'delivered') {
        await tx.purchaseRequest.update({
          where: { id: report.purchaseRequestId },
          data: { status: 'inspected', updatedBy: userId },
        });
      }

      return updated;
    });
  }

  async reject(orgId: string, id: string, expectedVersion: number, userId: string, remarks?: string) {
    const report = await this.requireReport(orgId, id);
    if (report.status !== 'submitted') {
      throw new BadRequestException('Only submitted reports can be rejected.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'rejected',
      overallResult: 'rejected',
      acceptedBy: userId,
      acceptedAt: new Date(),
      updatedBy: userId,
      ...(remarks ? { remarks } : {}),
    }, userId);
  }

  private async requireReport(orgId: string, id: string) {
    const report = await this.prisma.inspectionReport.findFirst({
      where: { id, organizationId: orgId },
      include: {
        purchaseRequest: { select: { id: true, status: true } },
      },
    });
    if (!report) throw new NotFoundException('Inspection report not found.');
    return report;
  }

  private async updateWithVersionCheck(
    id: string,
    expectedVersion: number,
    data: Record<string, unknown>,
    userId: string,
  ) {
    return runAudited(this.prisma, userId, (tx) =>
      tx.inspectionReport.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
        select: REPORT_SELECT,
      }),
    );
  }

  private async generateReportNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'INSPECTION_REPORT'
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `IR-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'INSPECTION_REPORT', 'IR-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate inspection report number.');
    return `IR-${String(Number(row.next_number)).padStart(6, '0')}`;
  }
}
