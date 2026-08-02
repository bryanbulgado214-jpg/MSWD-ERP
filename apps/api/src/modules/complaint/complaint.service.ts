import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

const COMPLAINT_INCLUDE = {
  consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, position: { select: { title: true } } } },
  notes: { orderBy: { createdAt: 'desc' as const }, include: { author: { select: { id: true, username: true } } } },
  workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
} satisfies Prisma.ComplaintInclude;

@Injectable()
export class ComplaintService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: {
    status?: string;
    type?: string;
    priority?: string;
    search?: string;
    consumerId?: string;
  } = {}) {
    const where: Prisma.ComplaintWhereInput = { organizationId };

    if (filters.status) (where as Record<string, unknown>).status = filters.status;
    if (filters.type) (where as Record<string, unknown>).type = filters.type;
    if (filters.priority) (where as Record<string, unknown>).priority = filters.priority;
    if (filters.consumerId) where.consumerId = filters.consumerId;
    if (filters.search) {
      where.OR = [
        { complaintNumber: { contains: filters.search, mode: 'insensitive' } },
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { contactName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.complaint.findMany({
      where,
      include: COMPLAINT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, organizationId },
      include: {
        ...COMPLAINT_INCLUDE,
        attachments: { orderBy: { createdAt: 'desc' } },
        creator: { select: { id: true, username: true } },
      },
    });
    if (!complaint) throw new NotFoundException('Complaint not found.');
    return complaint;
  }

  async create(organizationId: string, userId: string, data: {
    type: string;
    priority?: string;
    subject: string;
    description: string;
    location?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    consumerId?: string;
  }) {
    const complaintNumber = await this.nextNumber(organizationId);

    return this.prisma.complaint.create({
      data: {
        organizationId,
        complaintNumber,
        type: data.type as never,
        ...(data.priority ? { priority: data.priority as never } : {}),
        subject: data.subject,
        description: data.description,
        ...(data.location ? { location: data.location } : {}),
        ...(data.contactName ? { contactName: data.contactName } : {}),
        ...(data.contactPhone ? { contactPhone: data.contactPhone } : {}),
        ...(data.contactEmail ? { contactEmail: data.contactEmail } : {}),
        ...(data.consumerId ? { consumerId: data.consumerId } : {}),
        createdBy: userId,
        updatedBy: userId,
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async update(organizationId: string, userId: string, id: string, data: {
    expectedVersion: number;
    priority?: string;
    subject?: string;
    description?: string;
    location?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    consumerId?: string;
  }) {
    const complaint = await this.findOne(organizationId, id);
    if (!['open', 'reopened'].includes(complaint.status)) {
      throw new BadRequestException('Can only update open or reopened complaints.');
    }
    if (complaint.version !== data.expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    return this.prisma.complaint.update({
      where: { id },
      data: {
        ...(data.priority ? { priority: data.priority as never } : {}),
        ...(data.subject ? { subject: data.subject } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.location ? { location: data.location } : {}),
        ...(data.contactName ? { contactName: data.contactName } : {}),
        ...(data.contactPhone ? { contactPhone: data.contactPhone } : {}),
        ...(data.contactEmail ? { contactEmail: data.contactEmail } : {}),
        ...(data.consumerId ? { consumerId: data.consumerId } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async assign(organizationId: string, userId: string, id: string, data: {
    expectedVersion: number;
    assignedTo: string;
  }) {
    const complaint = await this.findOne(organizationId, id);
    if (!['open', 'assigned', 'reopened'].includes(complaint.status)) {
      throw new BadRequestException('Cannot assign complaint in current status.');
    }
    if (complaint.version !== data.expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    return this.prisma.complaint.update({
      where: { id },
      data: {
        assignedTo: data.assignedTo,
        assignedAt: new Date(),
        status: 'assigned',
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async startProgress(organizationId: string, userId: string, id: string, expectedVersion: number) {
    const complaint = await this.findOne(organizationId, id);
    if (complaint.status !== 'assigned') {
      throw new BadRequestException('Only assigned complaints can be started.');
    }
    if (complaint.version !== expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    return this.prisma.complaint.update({
      where: { id },
      data: {
        status: 'in_progress',
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async resolve(organizationId: string, userId: string, id: string, data: {
    expectedVersion: number;
    resolutionType: string;
    resolutionNotes?: string;
  }) {
    const complaint = await this.findOne(organizationId, id);
    if (!['assigned', 'in_progress'].includes(complaint.status)) {
      throw new BadRequestException('Only assigned or in-progress complaints can be resolved.');
    }
    if (complaint.version !== data.expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    return this.prisma.complaint.update({
      where: { id },
      data: {
        status: 'resolved',
        resolutionType: data.resolutionType as never,
        ...(data.resolutionNotes ? { resolutionNotes: data.resolutionNotes } : {}),
        resolvedAt: new Date(),
        resolvedBy: userId,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async close(organizationId: string, userId: string, id: string, expectedVersion: number) {
    const complaint = await this.findOne(organizationId, id);
    if (!['resolved'].includes(complaint.status)) {
      throw new BadRequestException('Only resolved complaints can be closed.');
    }
    if (complaint.version !== expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    return this.prisma.complaint.update({
      where: { id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedBy: userId,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async reopen(organizationId: string, userId: string, id: string, data: {
    expectedVersion: number;
    reason?: string;
  }) {
    const complaint = await this.findOne(organizationId, id);
    if (!['resolved', 'closed'].includes(complaint.status)) {
      throw new BadRequestException('Only resolved or closed complaints can be reopened.');
    }
    if (complaint.version !== data.expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id },
        data: {
          status: 'reopened',
          resolutionType: null,
          resolutionNotes: null,
          resolvedAt: null,
          resolvedBy: null,
          closedAt: null,
          closedBy: null,
          updatedBy: userId,
          version: { increment: 1 },
        },
        include: COMPLAINT_INCLUDE,
      });

      if (data.reason) {
        await tx.complaintNote.create({
          data: { complaintId: id, note: `Reopened: ${data.reason}`, createdBy: userId },
        });
      }

      return updated;
    });
  }

  async addNote(organizationId: string, userId: string, id: string, note: string, isInternal = false) {
    await this.findOne(organizationId, id);
    return this.prisma.complaintNote.create({
      data: { complaintId: id, note, isInternal, createdBy: userId },
      include: { author: { select: { id: true, username: true } } },
    });
  }

  async linkWorkOrder(organizationId: string, userId: string, id: string, data: {
    expectedVersion: number;
    workOrderId: string;
  }) {
    const complaint = await this.findOne(organizationId, id);
    if (complaint.version !== data.expectedVersion) {
      throw new ConflictException('Complaint was modified by another user. Please reload.');
    }

    const wo = await this.prisma.workOrder.findFirst({
      where: { id: data.workOrderId, organizationId },
    });
    if (!wo) throw new NotFoundException('Work order not found.');

    return this.prisma.complaint.update({
      where: { id },
      data: {
        workOrderId: data.workOrderId,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: COMPLAINT_INCLUDE,
    });
  }

  async getDashboardStats(organizationId: string) {
    const [byStatus, byType, byPriority, recentComplaints, slaBreached] = await Promise.all([
      this.prisma.complaint.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      this.prisma.complaint.groupBy({
        by: ['type'],
        where: { organizationId, status: { notIn: ['closed'] } },
        _count: true,
      }),
      this.prisma.complaint.groupBy({
        by: ['priority'],
        where: { organizationId, status: { notIn: ['resolved', 'closed'] } },
        _count: true,
      }),
      this.prisma.complaint.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          consumer: { select: { firstName: true, lastName: true } },
          assignee: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.complaint.count({
        where: {
          organizationId,
          status: { notIn: ['resolved', 'closed'] },
          slaDueAt: { lt: new Date() },
        },
      }),
    ]);

    return { byStatus, byType, byPriority, recentComplaints, slaBreached };
  }

  async getReport(organizationId: string, filters: {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    type?: string;
  } = {}) {
    const where: Prisma.ComplaintWhereInput = { organizationId };

    if (filters.status) (where as Record<string, unknown>).status = filters.status;
    if (filters.type) (where as Record<string, unknown>).type = filters.type;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setDate(to.getDate() + 1);
        (where.createdAt as Record<string, unknown>).lt = to;
      }
    }

    const complaints = await this.prisma.complaint.findMany({
      where,
      include: {
        consumer: { select: { firstName: true, lastName: true, accountNumber: true } },
        assignee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = complaints.length;
    const resolvedCount = complaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length;

    const durations = complaints
      .filter((c) => c.resolvedAt && c.createdAt)
      .map((c) => (c.resolvedAt!.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60));

    const avgResolutionHrs = durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : null;

    return {
      complaints,
      summary: { totalCount, resolvedCount, avgResolutionHrs },
    };
  }

  private async nextNumber(organizationId: string): Promise<string> {
    const seq = await this.prisma.documentSequence.findFirst({
      where: { organizationId, documentType: 'complaint' },
    });
    if (!seq) throw new BadRequestException('Document sequence for complaints not configured.');

    const updated = await this.prisma.documentSequence.update({
      where: { id: seq.id },
      data: { nextNumber: { increment: 1 }, lastGeneratedAt: new Date() },
    });

    const num = Number(seq.nextNumber);
    return `${seq.prefix}${String(num).padStart(seq.padding, '0')}`;
  }
}
