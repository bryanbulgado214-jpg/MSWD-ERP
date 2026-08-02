import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

const DV_SELECT = {
  id: true,
  dvNumber: true,
  dvDate: true,
  particulars: true,
  paymentMode: true,
  grossAmount: true,
  taxAmount: true,
  otherDeductions: true,
  netAmount: true,
  checkNumber: true,
  checkDate: true,
  bankName: true,
  accountCode: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  certifiedAt: true,
  approvedAt: true,
  releasedAt: true,
  ors: {
    select: {
      id: true,
      orsNumber: true,
      originalAmount: true,
      status: true,
    },
  },
  purchaseRequest: {
    select: { id: true, prNumber: true, title: true, status: true },
  },
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      contractAmount: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  supplier: { select: { id: true, name: true, tin: true } },
  inspectionReport: {
    select: { id: true, reportNumber: true, overallResult: true },
  },
  fundSource: { select: { id: true, code: true, name: true } },
  responsibilityCenter: { select: { id: true, code: true, name: true } },
  certifier: { select: { id: true, username: true } },
  approver: { select: { id: true, username: true } },
  releaser: { select: { id: true, username: true } },
  creator: { select: { id: true, username: true } },
  updater: { select: { id: true, username: true } },
};

interface CreateDvData {
  orsId: string;
  particulars: string;
  paymentMode?: 'check' | 'ada' | 'others';
  grossAmount: number;
  taxAmount?: number;
  otherDeductions?: number;
  inspectionReportId?: string;
  accountCode?: string;
  checkNumber?: string;
  checkDate?: string;
  bankName?: string;
}

@Injectable()
export class DvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  async list(orgId: string, filters?: { status?: string; supplierId?: string }) {
    const where: Prisma.DisbursementVoucherWhereInput = { organizationId: orgId };
    if (filters?.status) where.status = filters.status as never;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    return this.prisma.disbursementVoucher.findMany({
      where,
      select: DV_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
      select: DV_SELECT,
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');
    return dv;
  }

  async create(orgId: string, userId: string, data: CreateDvData) {
    const ors = await this.prisma.obligationRequest.findFirst({
      where: { id: data.orsId, organizationId: orgId },
      include: {
        purchaseRequest: { select: { id: true } },
        purchaseOrder: { select: { id: true } },
        supplier: { select: { id: true } },
        fundSource: { select: { id: true } },
        responsibilityCenter: { select: { id: true } },
      },
    });
    if (!ors) throw new NotFoundException('Obligation Request not found.');
    if (!ors.purchaseOrderId || !ors.purchaseOrder) {
      throw new BadRequestException('ORS must be linked to a Purchase Order.');
    }

    const taxAmount = data.taxAmount ?? 0;
    const otherDeductions = data.otherDeductions ?? 0;
    const netAmount = data.grossAmount - taxAmount - otherDeductions;

    const dvNumber = await this.generateDvNumber(orgId);

    return runAudited(this.prisma, userId, (tx) =>
      tx.disbursementVoucher.create({
        data: {
          organizationId: orgId,
          dvNumber,
          dvDate: new Date(),
          orsId: ors.id,
          purchaseRequestId: ors.purchaseRequest!.id,
          purchaseOrderId: ors.purchaseOrder!.id,
          supplierId: ors.supplier!.id,
          ...(data.inspectionReportId ? { inspectionReportId: data.inspectionReportId } : {}),
          ...(ors.fundSource ? { fundSourceId: ors.fundSource.id } : {}),
          ...(ors.responsibilityCenter ? { responsibilityCenterId: ors.responsibilityCenter.id } : {}),
          ...(data.accountCode ? { accountCode: data.accountCode } : {}),
          particulars: data.particulars,
          ...(data.paymentMode ? { paymentMode: data.paymentMode } : {}),
          grossAmount: data.grossAmount,
          taxAmount,
          otherDeductions,
          netAmount,
          ...(data.checkNumber ? { checkNumber: data.checkNumber } : {}),
          ...(data.checkDate ? { checkDate: new Date(data.checkDate) } : {}),
          ...(data.bankName ? { bankName: data.bankName } : {}),
          status: 'draft',
          createdBy: userId,
          updatedBy: userId,
        },
        select: DV_SELECT,
      }),
    );
  }

  async submitForCertification(orgId: string, id: string, expectedVersion: number, userId: string) {
    const dv = await this.requireDv(orgId, id);
    if (dv.status !== 'draft') {
      throw new BadRequestException('Only draft DVs can be submitted for certification.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'for_certification',
      updatedBy: userId,
    }, userId);
  }

  async certify(orgId: string, id: string, expectedVersion: number, userId: string, remarks?: string) {
    const dv = await this.requireDv(orgId, id);
    if (dv.status !== 'for_certification') {
      throw new BadRequestException('Only DVs pending certification can be certified.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'certified',
      certifiedBy: userId,
      certifiedAt: new Date(),
      updatedBy: userId,
      ...(remarks ? { remarks } : {}),
    }, userId);
  }

  async submitForApproval(orgId: string, id: string, expectedVersion: number, userId: string) {
    const dv = await this.requireDv(orgId, id);
    if (dv.status !== 'certified') {
      throw new BadRequestException('Only certified DVs can be submitted for approval.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'for_approval',
      updatedBy: userId,
    }, userId);
  }

  async approve(orgId: string, id: string, expectedVersion: number, userId: string, remarks?: string) {
    const dv = await this.requireDv(orgId, id);
    if (dv.status !== 'for_approval') {
      throw new BadRequestException('Only DVs pending approval can be approved.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedBy: userId,
      ...(remarks ? { remarks } : {}),
    }, userId);
  }

  async release(
    orgId: string,
    id: string,
    expectedVersion: number,
    userId: string,
    payment?: { checkNumber?: string; checkDate?: string; bankName?: string; remarks?: string },
  ) {
    const dv = await this.requireDv(orgId, id);
    if (dv.status !== 'approved') {
      throw new BadRequestException('Only approved DVs can be released.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.disbursementVoucher.update({
        where: { id, version: expectedVersion },
        data: {
          status: 'released',
          releasedBy: userId,
          releasedAt: new Date(),
          updatedBy: userId,
          ...(payment?.checkNumber ? { checkNumber: payment.checkNumber } : {}),
          ...(payment?.checkDate ? { checkDate: new Date(payment.checkDate) } : {}),
          ...(payment?.bankName ? { bankName: payment.bankName } : {}),
          ...(payment?.remarks ? { remarks: payment.remarks } : {}),
          version: { increment: 1 },
        },
        select: DV_SELECT,
      });

      await tx.orsChild.create({
        data: {
          orsId: dv.orsId,
          childType: 'disbursement_voucher',
          referenceNumber: dv.dvNumber,
          childDate: new Date(),
          amount: dv.netAmount,
          description: `DV ${dv.dvNumber} released`,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await this.autoJev.onDvReleased(tx, orgId, userId, {
        id: dv.id,
        dvNumber: dv.dvNumber,
        dvDate: dv.dvDate,
        particulars: dv.particulars,
        grossAmount: Number(dv.grossAmount),
        taxAmount: Number(dv.taxAmount),
        otherDeductions: Number(dv.otherDeductions),
        netAmount: Number(dv.netAmount),
        fundSourceId: dv.fundSourceId,
        responsibilityCenterId: dv.responsibilityCenterId,
      });

      return updated;
    });
  }

  async cancel(orgId: string, id: string, expectedVersion: number, userId: string, remarks?: string) {
    const dv = await this.requireDv(orgId, id);
    if (dv.status === 'released' || dv.status === 'cancelled') {
      throw new BadRequestException('Released or cancelled DVs cannot be cancelled.');
    }
    return this.updateWithVersionCheck(id, expectedVersion, {
      status: 'cancelled',
      updatedBy: userId,
      ...(remarks ? { remarks } : {}),
    }, userId);
  }

  private async requireDv(orgId: string, id: string) {
    const dv = await this.prisma.disbursementVoucher.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!dv) throw new NotFoundException('Disbursement voucher not found.');
    return dv;
  }

  private async updateWithVersionCheck(
    id: string,
    expectedVersion: number,
    data: Record<string, unknown>,
    userId: string,
  ) {
    return runAudited(this.prisma, userId, (tx) =>
      tx.disbursementVoucher.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
        select: DV_SELECT,
      }),
    );
  }

  private async generateDvNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'DISBURSEMENT_VOUCHER'
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `DV-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'DISBURSEMENT_VOUCHER', 'DV-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate DV number.');
    return `DV-${String(Number(row.next_number)).padStart(6, '0')}`;
  }
}
