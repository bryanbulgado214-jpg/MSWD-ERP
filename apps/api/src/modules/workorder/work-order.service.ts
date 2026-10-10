import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ForbiddenException } from '@nestjs/common';
import type { WorkOrderType } from '@prisma/client';

import { getGrantedPermissionCodes } from '../../common/guards/get-granted-permission-codes';
import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';
import { NotificationService } from '../notification/notification.service';
import {
  assignPermissionFor,
  natureOfType,
  signatureRequiredByDefault,
} from './work-order-taxonomy';

@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJevService: AutoJevService,
    private readonly notifications: NotificationService,
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
        teamLeader: { select: { id: true, name: true } },
        verifier: { select: { id: true, username: true } },
        _count: { select: { materials: true, notes: true, members: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, organizationId },
      include: {
        consumer: {
          select: { id: true, firstName: true, lastName: true, accountNumber: true, address: true },
        },
        meter: { select: { id: true, serialNumber: true, brand: true } },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            position: { select: { title: true } },
          },
        },
        verifier: { select: { id: true, username: true, fullName: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        updater: { select: { id: true, username: true, fullName: true } },
        crewAssigner: { select: { id: true, username: true, fullName: true } },
        team: { select: { id: true, name: true } },
        teamLeader: { select: { id: true, name: true, designation: true } },
        members: {
          include: {
            personnel: { select: { id: true, name: true, designation: true, section: true } },
          },
          orderBy: { isLeader: 'desc' },
        },
        crews: {
          include: {
            teamLeader: { select: { id: true, name: true, designation: true } },
            members: {
              include: {
                personnel: { select: { id: true, name: true, designation: true, section: true } },
              },
              orderBy: { isLeader: 'desc' },
            },
          },
          orderBy: { crewNumber: 'asc' },
        },
        materials: {
          include: {
            inventoryItem: {
              select: { id: true, itemCode: true, description: true, unitOfMeasure: true },
            },
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
      customerName?: string;
      meterId?: string;
      location?: string;
      scheduledDate?: string;
      estimatedDurationHrs?: number;
      instructions?: string;
      remarks?: string;
      customerSignatureRequired?: boolean;
      // Crew the creator wants to dispatch. Only applied when the creator holds
      // the assign permission for this work order's nature (technical/commercial).
      soloTask?: boolean;
      teamId?: string;
      teamLeaderId?: string;
      memberIds?: string[];
    },
  ) {
    const type = dto.type as WorkOrderType;
    const nature = natureOfType(type);
    const signatureRequired =
      dto.customerSignatureRequired ?? signatureRequiredByDefault(type);

    // Can this creator finalise the crew now? (Technical orders need Technical
    // Services; commercial orders need Commercial Services.)
    const wantsCrew = !!(dto.teamLeaderId || (dto.memberIds && dto.memberIds.length));
    let assignCrewNow = false;
    if (wantsCrew) {
      const granted = await getGrantedPermissionCodes(this.prisma, userId);
      assignCrewNow = granted.has(assignPermissionFor(nature));
    }
    if (assignCrewNow) {
      await this.assertCrewInOrg(organizationId, dto.teamLeaderId, dto.memberIds);
    }

    const woNumber = await this.generateWoNumber(organizationId);
    const solo = !!dto.soloTask;
    const members = assignCrewNow
      ? this.buildMemberRows(dto.teamLeaderId, solo ? [] : dto.memberIds)
      : [];

    const created = await runAudited(this.prisma, userId, async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          organizationId,
          woNumber,
          type: type as never,
          nature,
          ...(dto.priority ? { priority: dto.priority as never } : {}),
          status: assignCrewNow ? ('assigned' as never) : ('pending' as never),
          title: dto.title,
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.consumerId ? { consumerId: dto.consumerId } : {}),
          ...(dto.customerName ? { customerName: dto.customerName.trim() } : {}),
          ...(dto.meterId ? { meterId: dto.meterId } : {}),
          ...(dto.location ? { location: dto.location } : {}),
          ...(dto.scheduledDate ? { scheduledDate: new Date(dto.scheduledDate) } : {}),
          ...(dto.estimatedDurationHrs != null ? { estimatedDurationHrs: dto.estimatedDurationHrs } : {}),
          ...(dto.instructions ? { instructions: dto.instructions.trim() } : {}),
          ...(dto.remarks ? { remarks: dto.remarks.trim() } : {}),
          customerSignatureRequired: signatureRequired,
          ...(assignCrewNow
            ? {
                soloTask: solo,
                teamId: solo ? null : (dto.teamId ?? null),
                teamLeaderId: dto.teamLeaderId ?? null,
                assignedCrewBy: userId,
                assignedCrewAt: new Date(),
                members: { create: members },
              }
            : {}),
          createdBy: userId,
          updatedBy: userId,
        },
      });
      // Seed Crew 1 and attach the members to it when a crew was assigned now.
      if (assignCrewNow) {
        const crew = await tx.workOrderCrew.create({
          data: {
            workOrderId: workOrder.id,
            crewNumber: 1,
            soloTask: solo,
            teamId: solo ? null : (dto.teamId ?? null),
            teamLeaderId: dto.teamLeaderId ?? null,
            status: 'assigned',
          },
        });
        await tx.workOrderMember.updateMany({
          where: { workOrderId: workOrder.id },
          data: { crewId: crew.id },
        });
      }
      return workOrder;
    });

    // Real-time hand-off: when the order still needs crew assignment (e.g.
    // Commercial created a technical order), notify whoever can assign it for
    // this nature — the Technical / Commercial Services Head(s). The creator is
    // excluded so they don't notify themselves.
    if (!assignCrewNow) {
      await this.notifications.notifyUsersWithPermission(
        organizationId,
        assignPermissionFor(nature),
        {
          title: 'New work order needs crew assignment',
          body: `${created.woNumber} — ${created.title}`,
          linkUrl: `/work-orders/${created.id}`,
          relatedTable: 'work_orders',
          relatedId: created.id,
        },
        userId,
      );
    }
    return created;
  }

  // Build the per-order crew rows: the leader (isLeader) + the other members,
  // de-duplicated (the leader is included in the crew even if omitted from
  // memberIds).
  private buildMemberRows(leaderId?: string, memberIds?: string[]) {
    const ids = new Set(memberIds ?? []);
    if (leaderId) ids.add(leaderId);
    return [...ids].map((personnelId) => ({ personnelId, isLeader: personnelId === leaderId }));
  }

  private async assertCrewInOrg(organizationId: string, leaderId?: string, memberIds?: string[]) {
    const ids = [...new Set([...(leaderId ? [leaderId] : []), ...(memberIds ?? [])])];
    if (!ids.length) return;
    const count = await this.prisma.workOrderPersonnel.count({
      where: { organizationId, id: { in: ids } },
    });
    if (count !== ids.length) throw new BadRequestException('One or more crew members are invalid.');
  }

  // Assign (or re-assign) the crew for a work order. Enforces the nature rule:
  // a technical order needs workorder.assign.technical; a commercial one needs
  // workorder.assign.commercial.
  async assignCrew(
    organizationId: string,
    userId: string,
    id: string,
    dto: {
      expectedVersion: number;
      // Preferred: one or more crews, each with its own leader + members.
      crews?: { soloTask?: boolean; teamId?: string; teamLeaderId?: string; memberIds?: string[] }[];
      // Legacy single-crew fields (kept for backward compatibility).
      soloTask?: boolean;
      teamId?: string;
      teamLeaderId?: string;
      memberIds?: string[];
    },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);
    if (!['pending', 'assigned'].includes(wo.status)) {
      throw new BadRequestException('Crew can only be assigned while the work order is pending or assigned.');
    }
    await this.assertCanAssign(userId, wo.nature);

    // Accept the multi-crew shape, or fold the legacy single-crew fields into a
    // one-crew list.
    const crewInputs =
      dto.crews && dto.crews.length
        ? dto.crews
        : dto.teamLeaderId
          ? [{ soloTask: dto.soloTask, teamId: dto.teamId, teamLeaderId: dto.teamLeaderId, memberIds: dto.memberIds }]
          : [];
    if (!crewInputs.length) {
      throw new BadRequestException('Assign at least one crew with a leader.');
    }

    // Validate each crew; a person can be on only one crew of this work order.
    const seen = new Set<string>();
    const normalized = crewInputs.map((c) => {
      const solo = !!c.soloTask;
      if (!c.teamLeaderId) {
        throw new BadRequestException(
          solo ? 'Select the personnel for the one-man task.' : 'Designate a team leader for each crew.',
        );
      }
      const memberIds = solo ? [] : (c.memberIds ?? []);
      for (const pid of [c.teamLeaderId, ...memberIds]) {
        if (seen.has(pid)) {
          throw new BadRequestException('A person can be on only one crew of this work order.');
        }
        seen.add(pid);
      }
      return { solo, teamId: c.teamId, teamLeaderId: c.teamLeaderId, memberIds };
    });
    for (const c of normalized) {
      await this.assertCrewInOrg(organizationId, c.teamLeaderId, c.memberIds);
    }

    await runAudited(this.prisma, userId, async (tx) => {
      // Replace any existing crews (and their members) for this order.
      await tx.workOrderMember.deleteMany({ where: { workOrderId: id } });
      await tx.workOrderCrew.deleteMany({ where: { workOrderId: id } });
      let crewNumber = 1;
      for (const c of normalized) {
        const rows = this.buildMemberRows(c.teamLeaderId, c.memberIds);
        await tx.workOrderCrew.create({
          data: {
            workOrderId: id,
            crewNumber: crewNumber++,
            soloTask: c.solo,
            teamId: c.solo ? null : (c.teamId ?? null),
            teamLeaderId: c.teamLeaderId,
            status: 'assigned',
            members: {
              create: rows.map((r) => ({
                workOrderId: id,
                personnelId: r.personnelId,
                isLeader: r.isLeader,
              })),
            },
          },
        });
      }
      const first = normalized[0]!;
      const single = normalized.length === 1;
      await tx.workOrder.update({
        where: { id },
        data: {
          soloTask: single ? first.solo : false,
          teamId: single && !first.solo ? (first.teamId ?? null) : null,
          teamLeaderId: first.teamLeaderId,
          assignedCrewBy: userId,
          assignedCrewAt: new Date(),
          status: 'assigned',
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });
    // The hand-off is done — clear the "needs assignment" notification.
    await this.notifications.markReadByRelated(organizationId, 'work_orders', [id]);
    return this.findOne(organizationId, id);
  }

  // Dispatch ONE crew to the field: flips only that crew's members to on_field,
  // and moves the work order to in_progress on the first dispatch.
  async dispatchCrew(
    organizationId: string,
    userId: string,
    id: string,
    crewId: string,
    dto: { expectedVersion: number; timeLeft?: string },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);
    await this.assertCanAssign(userId, wo.nature);
    const crew = await this.prisma.workOrderCrew.findFirst({ where: { id: crewId, workOrderId: id } });
    if (!crew) throw new NotFoundException('Crew not found on this work order.');
    if (crew.status !== 'assigned') {
      throw new BadRequestException('Only an assigned crew can be dispatched.');
    }
    if (!['assigned', 'in_progress'].includes(wo.status)) {
      throw new BadRequestException('The work order is not in a state where a crew can be dispatched.');
    }
    const when = dto.timeLeft ? new Date(dto.timeLeft) : new Date();
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.workOrderCrew.update({
        where: { id: crewId },
        data: { status: 'dispatched', dispatchedAt: new Date(), timeLeft: when },
      });
      await this.setCrewMembersStatus(tx, crewId, 'on_field');
      await tx.workOrder.update({
        where: { id },
        data: {
          ...(wo.status === 'assigned'
            ? { status: 'in_progress', startedAt: wo.startedAt ?? new Date(), timeLeft: wo.timeLeft ?? when }
            : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });
    return this.findOne(organizationId, id);
  }

  // Mark ONE crew back from the field: releases only that crew's members. When
  // every crew is done, the whole work order is completed (resolution report
  // accepted on that final crew).
  async completeCrew(
    organizationId: string,
    userId: string,
    id: string,
    crewId: string,
    dto: {
      expectedVersion: number;
      timeReturned?: string;
      completionNotes?: string;
      actualDurationHrs?: number;
      tasksPerformed?: string;
      issuesEncountered?: string;
      remarks?: string;
    },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);
    await this.assertCanAssign(userId, wo.nature);
    const crew = await this.prisma.workOrderCrew.findFirst({ where: { id: crewId, workOrderId: id } });
    if (!crew) throw new NotFoundException('Crew not found on this work order.');
    if (crew.status !== 'dispatched') {
      throw new BadRequestException('Only a dispatched crew can be marked complete.');
    }
    const when = dto.timeReturned ? new Date(dto.timeReturned) : new Date();
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.workOrderCrew.update({
        where: { id: crewId },
        data: { status: 'completed', completedAt: new Date(), timeReturned: when },
      });
      await this.setCrewMembersStatus(tx, crewId, 'available');
      const remaining = await tx.workOrderCrew.count({
        where: { workOrderId: id, status: { in: ['assigned', 'dispatched'] } },
      });
      if (remaining === 0) {
        const materialsCost = await tx.workOrderMaterial.aggregate({
          where: { workOrderId: id },
          _sum: { totalCost: true },
        });
        await tx.workOrder.update({
          where: { id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            timeReturned: when,
            ...(dto.completionNotes ? { completionNotes: dto.completionNotes } : {}),
            ...(dto.actualDurationHrs != null ? { actualDurationHrs: dto.actualDurationHrs } : {}),
            ...(dto.tasksPerformed !== undefined ? { tasksPerformed: dto.tasksPerformed.trim() || null } : {}),
            ...(dto.issuesEncountered !== undefined ? { issuesEncountered: dto.issuesEncountered.trim() || null } : {}),
            ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
            materialsCost: materialsCost._sum.totalCost ?? 0,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      } else {
        await tx.workOrder.update({
          where: { id },
          data: { updatedBy: userId, version: { increment: 1 } },
        });
      }
    });
    return this.findOne(organizationId, id);
  }

  // Flip ONE crew's linked staff availability. Only staff currently "available"
  // go on_field, and only those currently "on_field" are released — so an
  // admin-set on_leave / unavailable is never overridden.
  private async setCrewMembersStatus(
    tx: Prisma.TransactionClient,
    crewId: string,
    to: 'on_field' | 'available',
  ) {
    const members = await tx.workOrderMember.findMany({
      where: { crewId },
      select: { personnelId: true },
    });
    const personnelIds = members.map((m) => m.personnelId);
    if (!personnelIds.length) return;
    await tx.staffMember.updateMany({
      where: {
        workOrderPersonnelId: { in: personnelIds },
        status: to === 'on_field' ? 'available' : 'on_field',
      },
      data: { status: to },
    });
  }

  private async assertCanAssign(userId: string, nature: Parameters<typeof assignPermissionFor>[0]) {
    const granted = await getGrantedPermissionCodes(this.prisma, userId);
    if (!granted.has(assignPermissionFor(nature))) {
      throw new ForbiddenException(
        nature === 'technical'
          ? 'This is a technical work order — only Technical Services can act on its crews.'
          : 'Only Commercial Services can act on the crews for this work order.',
      );
    }
  }

  // Dispatch the crew: records the time they left and moves to in_progress.
  async dispatch(
    organizationId: string,
    userId: string,
    id: string,
    dto: { expectedVersion: number; timeLeft?: string },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);
    if (wo.status !== 'assigned') {
      throw new BadRequestException('Only an assigned work order (with a crew) can be dispatched.');
    }
    const when = dto.timeLeft ? new Date(dto.timeLeft) : new Date();
    await runAudited(this.prisma, userId, async (tx) => {
      // Dispatch every assigned crew (one crew is the common case).
      await tx.workOrderCrew.updateMany({
        where: { workOrderId: id, status: 'assigned' },
        data: { status: 'dispatched', dispatchedAt: new Date(), timeLeft: when },
      });
      await tx.workOrder.update({
        where: { id },
        data: {
          status: 'in_progress',
          timeLeft: when,
          startedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      // The crew is now in the field — flip their availability.
      await this.setCrewStaffStatus(tx, id, 'on_field');
    });
    return this.findOne(organizationId, id);
  }

  // Flip the crew's linked staff availability when a work order moves to / from
  // the field. Only staff currently "available" are sent on_field, and only those
  // currently "on_field" are released — so an admin-set on_leave / unavailable is
  // never overridden.
  private async setCrewStaffStatus(
    tx: Prisma.TransactionClient,
    workOrderId: string,
    to: 'on_field' | 'available',
  ) {
    const members = await tx.workOrderMember.findMany({
      where: { workOrderId },
      select: { personnelId: true },
    });
    const personnelIds = members.map((m) => m.personnelId);
    if (!personnelIds.length) return;
    await tx.staffMember.updateMany({
      where: {
        workOrderPersonnelId: { in: personnelIds },
        status: to === 'on_field' ? 'available' : 'on_field',
      },
      data: { status: to },
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
      customerName?: string;
      meterId?: string;
      location?: string;
      scheduledDate?: string;
      estimatedDurationHrs?: number;
      instructions?: string;
      remarks?: string;
      customerSignatureRequired?: boolean;
    },
  ) {
    const wo = await this.findOneOrThrow(organizationId, id);
    this.checkVersion(wo.version, dto.expectedVersion);

    if (!['draft', 'pending', 'assigned'].includes(wo.status)) {
      throw new BadRequestException('Can only edit a work order before it is dispatched.');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.priority ? { priority: dto.priority as never } : {}),
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.consumerId !== undefined ? { consumerId: dto.consumerId || null } : {}),
        ...(dto.customerName !== undefined ? { customerName: dto.customerName.trim() || null } : {}),
        ...(dto.meterId !== undefined ? { meterId: dto.meterId || null } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.scheduledDate ? { scheduledDate: new Date(dto.scheduledDate) } : {}),
        ...(dto.estimatedDurationHrs != null ? { estimatedDurationHrs: dto.estimatedDurationHrs } : {}),
        ...(dto.instructions !== undefined ? { instructions: dto.instructions.trim() || null } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
        ...(dto.customerSignatureRequired !== undefined
          ? { customerSignatureRequired: dto.customerSignatureRequired }
          : {}),
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
      timeReturned?: string;
      tasksPerformed?: string;
      issuesEncountered?: string;
      remarks?: string;
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

    const when = dto.timeReturned ? new Date(dto.timeReturned) : new Date();
    await runAudited(this.prisma, userId, async (tx) => {
      // Close out every crew that is still open.
      await tx.workOrderCrew.updateMany({
        where: { workOrderId: id, status: { in: ['assigned', 'dispatched'] } },
        data: { status: 'completed', completedAt: new Date(), timeReturned: when },
      });
      await tx.workOrder.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          timeReturned: when,
          ...(dto.completionNotes ? { completionNotes: dto.completionNotes } : {}),
          ...(dto.actualDurationHrs != null ? { actualDurationHrs: dto.actualDurationHrs } : {}),
          ...(dto.tasksPerformed !== undefined ? { tasksPerformed: dto.tasksPerformed.trim() || null } : {}),
          ...(dto.issuesEncountered !== undefined ? { issuesEncountered: dto.issuesEncountered.trim() || null } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
          materialsCost: materialsCost._sum.totalCost ?? 0,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      // The crews are back from the field — release their availability.
      await this.setCrewStaffStatus(tx, id, 'available');
    });
    return this.findOne(organizationId, id);
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

    return runAudited(this.prisma, userId, async (tx) => {
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

      // Post the material consumption to the ledger inside the same transaction.
      // A missing posting account blocks verification rather than silently
      // skipping the entry.
      await this.autoJevService.onWorkOrderVerified(tx, organizationId, userId, {
        id: wo.id,
        woNumber: wo.woNumber,
        verifiedAt: new Date(),
      });

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

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.workOrderCrew.updateMany({
        where: { workOrderId: id, status: { in: ['assigned', 'dispatched'] } },
        data: { status: 'cancelled' },
      });
      const updated = await tx.workOrder.update({
        where: { id },
        data: {
          status: 'cancelled',
          ...(dto.reason ? { completionNotes: dto.reason } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      // Release any crew that was out in the field for this order.
      await this.setCrewStaffStatus(tx, id, 'available');
      return updated;
    });
  }

  async addNote(organizationId: string, userId: string, workOrderId: string, note: string) {
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
      throw new BadRequestException(
        'Can only add materials to assigned or in-progress work orders',
      );
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
          inventoryItem: {
            select: { id: true, itemCode: true, description: true, unitOfMeasure: true },
          },
        },
      });

      await tx.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: {
          onHandQuantity: currentQty - dto.quantityUsed,
          version: { increment: 1 },
        },
      });

      this.logger.log(`Deducted ${dto.quantityUsed} of ${item.itemCode} for WO ${wo.woNumber}`);

      return material;
    });
  }

  async removeMaterial(organizationId: string, workOrderId: string, materialId: string) {
    const wo = await this.findOneOrThrow(organizationId, workOrderId);
    if (!['assigned', 'in_progress'].includes(wo.status)) {
      throw new BadRequestException(
        'Can only remove materials from assigned or in-progress work orders',
      );
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
