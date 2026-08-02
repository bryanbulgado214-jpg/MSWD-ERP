import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';

@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJevService: AutoJevService,
  ) {}

  async findAll(
    organizationId: string,
    filters: {
      status?: string;
      type?: string;
      priority?: string;
      assignedTo?: string;
      search?: string;
    },
  ) {
    const where: Prisma.WorkOrderWhereInput = { organizationId };

    if (filters.status) where.status = filters.status as never;
    if (filters.type) where.type = filters.type as never;
    if (filters.priority) where.priority = filters.priority as never;
    if (filters.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters.search) {
      where.OR = [
        { woNumber: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.workOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        consumer: { select: { id: true, firstName: true, lastName: true, accountNumber: true } },
        meter: { select: { id: true, serialNumber: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        verifier: { select: { id: true, username: true } },
        _count: { select: { materials: true, notes: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, organizationId },
      include: {
        consumer: { select: { id: true, firstName: true, lastName: true, accountNumber: true, address: true } },
        meter: { select: { id: true, serialNumber: true, brand: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, position: { select: { title: true } } } },
        verifier: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
        materials: {
          include: {
            inventoryItem: { select: { id: true, itemCode: true, description: true, unitOfMeasure: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        notes: {
          include: {
            author: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!wo) throw new NotFoundException('Work order not found');
    return wo;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: {
      type: string;
      priority?: string;
      title: string;
      description?: string;
      consumerId?: string;
      meterId?: string;
      location?: string;
      scheduledDate?: string;
      assignedTo?: string;
      estimatedDurationHrs?: number;
    },
  ) {
    const woNumber = await this.generateWoNumber(organizationId);

    const hasAssignee = !!dto.assignedTo;

    return this.prisma.workOrder.create({
      data: {
        organizationId,
        woNumber,
        type: dto.type as never,
        ...(dto.priority ? { priority: dto.priority as never } : {}),
        status: hasAssignee ? 'assigned' as never : 'pending' as never,
        title: dto.title,
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.consumerId ? { consumerId: dto.consumerId } : {}),
        ...(dto.meterId ? { meterId: dto.meterId } : {}),
        ...(dto.location ? { location: dto.location } : {}),
        ...(dto.scheduledDate ? { scheduledDate: new Date(dto.scheduledDate) } : {}),
        ...(dto.assignedTo ? { assignedTo: dto.assignedTo, assignedAt: new Date() } : {}),
        ...(dto.estimatedDurationHrs != null ? { estimatedDurationHrs: dto.estimatedDurationHrs } : {}),
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: {
      expectedVersion: number;
      priority?: string;
      title?: string;
      description?: string;
      consumerId?: string;
      meterId?: string;
      location?: string;
      scheduledDate?: string;
      estimatedDurationHrs?: number;
    },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (!['draft', 'pending'].includes(wo.status)) {
      throw new BadRequestException('Can only edit work orders in draft or pending status');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.priority ? { priority: dto.priority as never } : {}),
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.consumerId ? { consumerId: dto.consumerId } : {}),
        ...(dto.meterId ? { meterId: dto.meterId } : {}),
        ...(dto.location ? { location: dto.location } : {}),
        ...(dto.scheduledDate ? { scheduledDate: new Date(dto.scheduledDate) } : {}),
        ...(dto.estimatedDurationHrs != null ? { estimatedDurationHrs: dto.estimatedDurationHrs } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async assign(
    organizationId: string,
    userId: string,
    id: string,
    dto: { expectedVersion: number; assignedTo: string },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (!['pending', 'assigned'].includes(wo.status)) {
      throw new BadRequestException('Can only assign work orders in pending or assigned status');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        assignedTo: dto.assignedTo,
        assignedAt: new Date(),
        status: 'assigned',
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async start(
    organizationId: string,
    userId: string,
    id: string,
    dto: { expectedVersion: number },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (wo.status !== 'assigned') {
      throw new BadRequestException('Can only start assigned work orders');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async complete(
    organizationId: string,
    userId: string,
    id: string,
    dto: {
      expectedVersion: number;
      completionNotes?: string;
      actualDurationHrs?: number;
    },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (wo.status !== 'in_progress') {
      throw new BadRequestException('Can only complete in-progress work orders');
    }

    const materialsCost = await this.prisma.workOrderMaterial.aggregate({
      where: { workOrderId: id },
      _sum: { totalCost: true },
    });

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        ...(dto.completionNotes ? { completionNotes: dto.completionNotes } : {}),
        ...(dto.actualDurationHrs != null ? { actualDurationHrs: dto.actualDurationHrs } : {}),
        materialsCost: materialsCost._sum.totalCost ?? 0,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async verify(
    organizationId: string,
    userId: string,
    id: string,
    dto: { expectedVersion: number },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (wo.status !== 'completed') {
      throw new BadRequestException('Can only verify completed work orders');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          status: 'verified',
          verifiedBy: userId,
          verifiedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      const materialsCost = Number(wo.materialsCost);
      if (materialsCost > 0) {
        try {
          await this.autoJevService.onWorkOrderVerified(tx, organizationId, userId, {
            id: wo.id,
            woNumber: wo.woNumber,
            verifiedAt: new Date(),
            materialsCost,
          });
        } catch (err) {
          this.logger.warn(`Auto-JEV failed for WO ${wo.woNumber}: ${err}`);
        }
      }

      return updated;
    });
  }

  async cancel(
    organizationId: string,
    userId: string,
    id: string,
    dto: { expectedVersion: number; reason?: string },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (['verified', 'cancelled'].includes(wo.status)) {
      throw new BadRequestException('Cannot cancel verified or already-cancelled work orders');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: 'cancelled',
        ...(dto.reason ? { completionNotes: dto.reason } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async addNote(
    organizationId: string,
    userId: string,
    workOrderId: string,
    note: string,
  ) {
    await this.findOneOrThrow(organizationId, workOrderId);

    return this.prisma.workOrderNote.create({
      data: {
        workOrderId,
        note,
        createdBy: userId,
      },
      include: {
        author: { select: { id: true, username: true } },
      },
    });
  }

  async addMaterial(
    organizationId: string,
    workOrderId: string,
    dto: {
      inventoryItemId: string;
      quantityUsed: number;
      unitCost?: number;
      notes?: string;
    },
  ) {
    const wo = await this.findOneOrThrow(organizationId, workOrderId);
    if (!['assigned', 'in_progress'].includes(wo.status)) {
      throw new BadRequestException('Can only add materials to assigned or in-progress work orders');
    }

    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: dto.inventoryItemId, organizationId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    const currentQty = Number(item.onHandQuantity);
    if (dto.quantityUsed > currentQty) {
      throw new BadRequestException(
        `Insufficient stock: ${currentQty} on hand, ${dto.quantityUsed} requested`,
      );
    }

    const unitCost = dto.unitCost ?? Number(item.unitCost);
    const totalCost = unitCost * dto.quantityUsed;

    return this.prisma.$transaction(async (tx) => {
      const material = await tx.workOrderMaterial.create({
        data: {
          workOrderId,
          inventoryItemId: dto.inventoryItemId,
          quantityUsed: dto.quantityUsed,
          unitCost,
          totalCost,
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
        include: {
          inventoryItem: { select: { id: true, itemCode: true, description: true, unitOfMeasure: true } },
        },
      });

      await tx.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: {
          onHandQuantity: currentQty - dto.quantityUsed,
          version: { increment: 1 },
        },
      });

      this.logger.log(
        `Deducted ${dto.quantityUsed} of ${item.itemCode} for WO ${wo.woNumber}`,
      );

      return material;
    });
  }

  async removeMaterial(organizationId: string, workOrderId: string, materialId: string) {
    const wo = await this.findOneOrThrow(organizationId, workOrderId);
    if (!['assigned', 'in_progress'].includes(wo.status)) {
      throw new BadRequestException('Can only remove materials from assigned or in-progress work orders');
    }

    const material = await this.prisma.workOrderMaterial.findFirst({
      where: { id: materialId, workOrderId },
    });
    if (!material) throw new NotFoundException('Material record not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.workOrderMaterial.delete({ where: { id: materialId } });

      const item = await tx.inventoryItem.findFirst({
        where: { id: material.inventoryItemId },
      });
      if (item) {
        await tx.inventoryItem.update({
          where: { id: material.inventoryItemId },
          data: {
            onHandQuantity: Number(item.onHandQuantity) + Number(material.quantityUsed),
            version: { increment: 1 },
          },
        });
        this.logger.log(
          `Restored ${material.quantityUsed} of ${item.itemCode} from WO ${wo.woNumber}`,
        );
      }
    });
  }

  async getDashboardStats(organizationId: string) {
    const [byStatus, byType, byPriority, recentCompleted] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      this.prisma.workOrder.groupBy({
        by: ['type'],
        where: { organizationId, status: { notIn: ['cancelled'] } },
        _count: true,
      }),
      this.prisma.workOrder.groupBy({
        by: ['priority'],
        where: { organizationId, status: { notIn: ['completed', 'verified', 'cancelled'] } },
        _count: true,
      }),
      this.prisma.workOrder.findMany({
        where: { organizationId, status: { in: ['completed', 'verified'] } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          woNumber: true,
          title: true,
          type: true,
          status: true,
          completedAt: true,
          materialsCost: true,
        },
      }),
    ]);

    return { byStatus, byType, byPriority, recentCompleted };
  }

  async getReport(
    organizationId: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      type?: string;
    },
  ) {
    const where: Prisma.WorkOrderWhereInput = { organizationId };
    if (filters.status) where.status = filters.status as never;
    if (filters.type) where.type = filters.type as never;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo + 'T23:59:59Z');
    }

    const [orders, summary] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          woNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          location: true,
          scheduledDate: true,
          completedAt: true,
          verifiedAt: true,
          estimatedDurationHrs: true,
          actualDurationHrs: true,
          materialsCost: true,
          createdAt: true,
          consumer: { select: { firstName: true, lastName: true, accountNumber: true } },
          assignee: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.workOrder.aggregate({
        where,
        _count: true,
        _sum: { materialsCost: true },
      }),
    ]);

    return {
      orders,
      summary: {
        totalCount: summary._count,
        totalMaterialsCost: summary._sum.materialsCost ?? 0,
      },
    };
  }

  private async findOneOrThrow(organizationId: string, id: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, organizationId },
    });
    if (!wo) throw new NotFoundException('Work order not found');
    return wo;
  }

  private checkVersion(current: number, expected: number) {
    if (current !== expected) {
      throw new ConflictException(
        `Version conflict: expected ${expected}, current is ${current}. Please refresh and try again.`,
      );
    }
  }

  private async generateWoNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'work_order'
        AND fiscal_year_id IS NULL
      RETURNING next_number
    `);

    if (updated.length > 0) {
      return `WO-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }

    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'work_order', 'WO-', 1)
      RETURNING next_number
    `);
    const row = inserted[0];
    if (!row) throw new Error('Failed to generate WO number from document_sequences.');
    return `WO-${String(Number(row.next_number)).padStart(6, '0')}`;
  }
}
