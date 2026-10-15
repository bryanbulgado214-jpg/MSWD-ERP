import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import type { CreateCustomerConcernDto, UpdateCustomerConcernDto } from './dto/customer-concern.dto';

const CCF_INCLUDE = {
  workOrders: {
    select: { id: true, woNumber: true, status: true, title: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CustomerConcernInclude;

type ConcernRow = Prisma.CustomerConcernGetPayload<{ include: typeof CCF_INCLUDE }>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class CustomerConcernService {
  constructor(private readonly prisma: PrismaService) {}

  // Add the open-duration (aging) indicators the register needs: days a concern
  // has been open, whether it is still open, and whether it is past its target.
  private withAging(r: ConcernRow) {
    const now = new Date();
    const isOpen = r.status === 'pending' || r.status === 'in_progress';
    const end = r.resolvedAt ?? now;
    const daysOpen = Math.max(0, Math.floor((end.getTime() - r.receivedAt.getTime()) / MS_PER_DAY));
    const overdue = isOpen && !!r.targetResolutionDate && now > r.targetResolutionDate;
    return { ...r, daysOpen, isOpen, overdue };
  }

  private async requireOne(organizationId: string, id: string): Promise<ConcernRow> {
    const row = await this.prisma.customerConcern.findFirst({
      where: { id, organizationId },
      include: CCF_INCLUDE,
    });
    if (!row) throw new NotFoundException('Customer concern (CCF) not found.');
    return row;
  }

  async findAll(
    organizationId: string,
    filters?: { status?: string; category?: string; search?: string },
  ) {
    const search = filters?.search?.trim();
    const rows = await this.prisma.customerConcern.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as never } : {}),
        ...(filters?.category ? { category: filters.category as never } : {}),
        ...(search
          ? {
              OR: [
                { referenceNumber: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { accountNumber: { contains: search, mode: 'insensitive' } },
                { nature: { contains: search, mode: 'insensitive' } },
                { assignedTo: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: CCF_INCLUDE,
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map((r) => this.withAging(r));
  }

  async findOne(organizationId: string, id: string) {
    return this.withAging(await this.requireOne(organizationId, id));
  }

  async create(organizationId: string, userId: string, dto: CreateCustomerConcernDto) {
    const referenceNumber = await this.generateReference(organizationId);
    const row = await this.prisma.customerConcern.create({
      data: {
        organizationId,
        referenceNumber,
        receivedAt: new Date(dto.receivedAt),
        customerName: dto.customerName.trim(),
        accountNumber: dto.accountNumber?.trim() || null,
        category: dto.category,
        nature: dto.nature.trim(),
        requestedAction: dto.requestedAction?.trim() || null,
        assignedTo: dto.assignedTo?.trim() || null,
        targetResolutionDate: dto.targetResolutionDate ? new Date(dto.targetResolutionDate) : null,
        remarks: dto.remarks?.trim() || null,
        status: 'pending',
        createdBy: userId,
      },
      include: CCF_INCLUDE,
    });
    return this.withAging(row);
  }

  async update(organizationId: string, id: string, userId: string, dto: UpdateCustomerConcernDto) {
    const existing = await this.requireOne(organizationId, id);
    if (existing.version !== dto.expectedVersion) {
      throw new ConflictException('This CCF was modified by someone else. Please refresh.');
    }

    const data: Prisma.CustomerConcernUpdateInput = {
      updatedBy: userId,
      version: { increment: 1 },
    };
    if (dto.receivedAt !== undefined) data.receivedAt = new Date(dto.receivedAt);
    if (dto.customerName !== undefined) data.customerName = dto.customerName.trim();
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber.trim() || null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.nature !== undefined) data.nature = dto.nature.trim();
    if (dto.requestedAction !== undefined) data.requestedAction = dto.requestedAction.trim() || null;
    if (dto.assignedTo !== undefined) data.assignedTo = dto.assignedTo.trim() || null;
    if (dto.actionTaken !== undefined) data.actionTaken = dto.actionTaken.trim() || null;
    if (dto.targetResolutionDate !== undefined)
      data.targetResolutionDate = dto.targetResolutionDate ? new Date(dto.targetResolutionDate) : null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks.trim() || null;

    // Status drives the actual resolution date: moving to resolved/closed stamps
    // it (unless one is given); moving back to an open state clears it.
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'resolved' || dto.status === 'closed') {
        data.resolvedAt = dto.resolvedAt
          ? new Date(dto.resolvedAt)
          : (existing.resolvedAt ?? new Date());
      } else {
        data.resolvedAt = null;
      }
    } else if (dto.resolvedAt !== undefined) {
      data.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;
    }

    const row = await this.prisma.customerConcern.update({
      where: { id },
      data,
      include: CCF_INCLUDE,
    });
    return this.withAging(row);
  }

  // Minimal list for tagging a CCF from a work order (reference + customer).
  async lookup(organizationId: string) {
    const rows = await this.prisma.customerConcern.findMany({
      where: { organizationId },
      select: {
        id: true,
        referenceNumber: true,
        customerName: true,
        category: true,
        status: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });
    return rows;
  }

  // Mint a CCF-000001 style reference from the shared document_sequences table,
  // self-seeding the sequence row on first use (same pattern as WO/PR numbers).
  private async generateReference(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'customer_concern'
        AND fiscal_year_id IS NULL
      RETURNING next_number
    `);
    if (updated.length > 0) {
      return `CCF-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }
    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'customer_concern', 'CCF-', 1)
      RETURNING next_number
    `);
    return `CCF-${String(Number(inserted[0]!.next_number)).padStart(6, '0')}`;
  }
}
