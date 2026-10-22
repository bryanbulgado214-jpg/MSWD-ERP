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
    const referenceNumber = dto.referenceNumber?.trim() || (await this.suggestReference(organizationId));
    try {
      const row = await this.prisma.customerConcern.create({
        data: {
          organizationId,
          referenceNumber,
          receivedAt: new Date(dto.receivedAt),
          customerName: dto.customerName.trim(),
          accountNumber: dto.accountNumber?.trim() || null,
          contactNumber: dto.contactNumber?.trim() || null,
          category: dto.category,
          nature: dto.nature.trim(),
          location: dto.location?.trim() || null,
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
    } catch (e) {
      throw this.duplicateSeriesOr(e, referenceNumber);
    }
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
    if (dto.referenceNumber !== undefined) data.referenceNumber = dto.referenceNumber.trim();
    if (dto.receivedAt !== undefined) data.receivedAt = new Date(dto.receivedAt);
    if (dto.customerName !== undefined) data.customerName = dto.customerName.trim();
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber.trim() || null;
    if (dto.contactNumber !== undefined) data.contactNumber = dto.contactNumber.trim() || null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.nature !== undefined) data.nature = dto.nature.trim();
    if (dto.location !== undefined) data.location = dto.location.trim() || null;
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

    try {
      const row = await this.prisma.customerConcern.update({
        where: { id },
        data,
        include: CCF_INCLUDE,
      });
      return this.withAging(row);
    } catch (e) {
      throw this.duplicateSeriesOr(e, dto.referenceNumber?.trim() ?? existing.referenceNumber);
    }
  }

  // Delete a CCF. Any work orders tagged to it are auto-unlinked
  // (WorkOrder.customerConcernId is onDelete: SetNull), not deleted.
  async remove(organizationId: string, id: string) {
    await this.requireOne(organizationId, id);
    await this.prisma.customerConcern.delete({ where: { id } });
    return { id, deleted: true };
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

  // The next suggested Series No. for a new CCF: the highest CCF-NNNNNN on file
  // plus one. Pre-fills the New-CCF form but stays editable, so custom-format
  // series the user typed are simply ignored when computing the suggestion.
  async suggestReference(organizationId: string): Promise<string> {
    const rows = await this.prisma.customerConcern.findMany({
      where: { organizationId },
      select: { referenceNumber: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = /^CCF-(\d+)$/i.exec(r.referenceNumber.trim());
      if (m) max = Math.max(max, parseInt(m[1]!, 10));
    }
    return `CCF-${String(max + 1).padStart(6, '0')}`;
  }

  // Turn a unique-constraint violation on the series number into a friendly 409.
  private duplicateSeriesOr(e: unknown, series: string): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002' &&
      (e.meta?.target as string[] | undefined)?.some((t) => t.includes('reference'))
    ) {
      return new ConflictException(`Series No. "${series}" is already used. Choose another.`);
    }
    return e;
  }
}
