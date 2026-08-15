import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { CreateLeaveApplicationDto } from './dto/leave.dto';

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async findLeaveTypes(orgId: string) {
    return this.prisma.leaveType.findMany({
      where: { organizationId: orgId },
      orderBy: { code: 'asc' },
    });
  }

  async findLeaveBalances(orgId: string, employeeId: string, year?: number) {
    const yr = year ?? new Date().getFullYear();
    return this.prisma.leaveBalance.findMany({
      where: { organizationId: orgId, employeeId, year: yr },
      include: { leaveType: { select: { id: true, code: true, name: true } } },
      orderBy: { leaveType: { code: 'asc' } },
    });
  }

  async initializeBalances(orgId: string, employeeId: string, year: number) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { organizationId: orgId, isActive: true },
    });

    const existing = await this.prisma.leaveBalance.findMany({
      where: { employeeId, year },
      select: { leaveTypeId: true },
    });
    const existingIds = new Set(existing.map((b) => b.leaveTypeId));

    const toCreate = leaveTypes.filter((lt) => !existingIds.has(lt.id));
    if (toCreate.length === 0) return { created: 0 };

    let carryOvers: Map<string, number> | undefined;
    const prevYear = year - 1;
    if (prevYear > 0) {
      const prev = await this.prisma.leaveBalance.findMany({
        where: { employeeId, year: prevYear },
        include: { leaveType: true },
      });
      carryOvers = new Map<string, number>();
      for (const p of prev) {
        if (p.leaveType.isCumulative) {
          carryOvers.set(p.leaveTypeId, Number(p.balance));
        }
      }
    }

    await this.prisma.leaveBalance.createMany({
      data: toCreate.map((lt) => {
        const co = carryOvers?.get(lt.id) ?? 0;
        return {
          organizationId: orgId,
          employeeId,
          leaveTypeId: lt.id,
          year,
          earned: Number(lt.defaultDays),
          used: 0,
          balance: Number(lt.defaultDays) + co,
          carryOver: co,
        };
      }),
    });
    return { created: toCreate.length };
  }

  async findApplications(
    orgId: string,
    filters?: {
      employeeId?: string;
      status?: string;
      year?: number;
    },
  ) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.status) where.status = filters.status;
    if (filters?.year) {
      const start = new Date(filters.year, 0, 1);
      const end = new Date(filters.year, 11, 31);
      where.startDate = { gte: start, lte: end };
    }
    return this.prisma.leaveApplication.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, code: true, name: true } },
        approver: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findApplication(orgId: string, id: string) {
    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
        leaveType: { select: { id: true, code: true, name: true } },
        approver: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
      },
    });
    if (!app) throw new NotFoundException('Leave application not found');
    return app;
  }

  async createApplication(orgId: string, dto: CreateLeaveApplicationDto, actorId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('End date must be after start date');
    }

    const overlapping = await this.prisma.leaveApplication.findFirst({
      where: {
        employeeId: dto.employeeId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: new Date(dto.endDate) },
        endDate: { gte: new Date(dto.startDate) },
      },
    });
    if (overlapping) throw new ConflictException('Employee has an overlapping leave application');

    return runAudited(this.prisma, actorId, (tx) =>
      tx.leaveApplication.create({
        data: {
          organizationId: orgId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          daysApplied: dto.daysApplied,
          ...(dto.reason ? { reason: dto.reason } : {}),
          createdBy: actorId,
          updatedBy: actorId,
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, code: true, name: true } },
        },
      }),
    );
  }

  async approveApplication(orgId: string, id: string, expectedVersion: number, actorId: string) {
    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!app) throw new NotFoundException('Leave application not found');
    if (app.version !== expectedVersion)
      throw new ConflictException('Record modified concurrently — reload.');
    if (app.status !== 'pending')
      throw new BadRequestException('Only pending applications can be approved');

    return runAudited(this.prisma, actorId, async (tx) => {
      const updated = await tx.leaveApplication.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: actorId,
          approvedAt: new Date(),
          updatedBy: actorId,
          version: { increment: 1 },
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, code: true, name: true } },
        },
      });

      const year = new Date(app.startDate).getFullYear();
      await tx.leaveBalance.updateMany({
        where: { employeeId: app.employeeId, leaveTypeId: app.leaveTypeId, year },
        data: {
          used: { increment: Number(app.daysApplied) },
          balance: { decrement: Number(app.daysApplied) },
        },
      });

      return updated;
    });
  }

  async rejectApplication(
    orgId: string,
    id: string,
    expectedVersion: number,
    rejectionReason: string,
    actorId: string,
  ) {
    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!app) throw new NotFoundException('Leave application not found');
    if (app.version !== expectedVersion)
      throw new ConflictException('Record modified concurrently — reload.');
    if (app.status !== 'pending')
      throw new BadRequestException('Only pending applications can be rejected');

    return runAudited(this.prisma, actorId, (tx) =>
      tx.leaveApplication.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectionReason,
          updatedBy: actorId,
          version: { increment: 1 },
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, code: true, name: true } },
        },
      }),
    );
  }

  async cancelApplication(orgId: string, id: string, expectedVersion: number, actorId: string) {
    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!app) throw new NotFoundException('Leave application not found');
    if (app.version !== expectedVersion)
      throw new ConflictException('Record modified concurrently — reload.');
    if (app.status !== 'pending' && app.status !== 'approved') {
      throw new BadRequestException('Only pending or approved applications can be cancelled');
    }

    return runAudited(this.prisma, actorId, async (tx) => {
      const updated = await tx.leaveApplication.update({
        where: { id },
        data: {
          status: 'cancelled',
          updatedBy: actorId,
          version: { increment: 1 },
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, code: true, name: true } },
        },
      });

      if (app.status === 'approved') {
        const year = new Date(app.startDate).getFullYear();
        await tx.leaveBalance.updateMany({
          where: { employeeId: app.employeeId, leaveTypeId: app.leaveTypeId, year },
          data: {
            used: { decrement: Number(app.daysApplied) },
            balance: { increment: Number(app.daysApplied) },
          },
        });
      }

      return updated;
    });
  }
}
