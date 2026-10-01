import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const END_USER_SELECT = {
  id: true,
  name: true,
  position: true,
  departmentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  department: { select: { id: true, code: true, name: true } },
} as const;

// The budget officer's list of requesting end-users (not login accounts),
// grouped by department/section. Mirrors the payee/supplier master pattern.
@Injectable()
export class EndUserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    opts: { departmentId?: string; includeInactive?: boolean } = {},
  ) {
    return this.prisma.ppmpEndUser.findMany({
      where: {
        organizationId,
        ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
        ...(!opts.includeInactive ? { isActive: true } : {}),
      },
      select: END_USER_SELECT,
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const endUser = await this.prisma.ppmpEndUser.findFirst({
      where: { id, organizationId },
      select: END_USER_SELECT,
    });
    if (!endUser) throw new NotFoundException('End-user not found.');
    return endUser;
  }

  async create(
    organizationId: string,
    userId: string,
    data: { name: string; departmentId: string; position?: string },
  ) {
    const name = data.name.trim();
    const department = await this.prisma.department.findFirst({
      where: { id: data.departmentId, organizationId },
      select: { id: true },
    });
    if (!department) throw new NotFoundException('Department not found.');

    const existing = await this.prisma.ppmpEndUser.findFirst({
      where: { organizationId, departmentId: data.departmentId, name },
    });
    if (existing) {
      throw new ConflictException('An end-user with this name already exists in this section.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.ppmpEndUser.create({
        data: {
          organizationId,
          departmentId: data.departmentId,
          name,
          ...(data.position?.trim() ? { position: data.position.trim() } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: END_USER_SELECT,
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      name?: string;
      departmentId?: string;
      position?: string | null;
      isActive?: boolean;
    },
  ) {
    const endUser = await this.prisma.ppmpEndUser.findFirst({ where: { id, organizationId } });
    if (!endUser) throw new NotFoundException('End-user not found.');
    if (endUser.version !== data.expectedVersion) {
      throw new ConflictException(
        'This end-user was modified by someone else. Please refresh and try again.',
      );
    }

    // Moving the end-user to a different section — make sure it exists first.
    if (data.departmentId && data.departmentId !== endUser.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: data.departmentId, organizationId },
        select: { id: true },
      });
      if (!department) throw new NotFoundException('Section (department) not found.');
    }

    const nextName = data.name?.trim() ?? endUser.name;
    const nextDept = data.departmentId ?? endUser.departmentId;
    if (nextName !== endUser.name || nextDept !== endUser.departmentId) {
      const dup = await this.prisma.ppmpEndUser.findFirst({
        where: { organizationId, departmentId: nextDept, name: nextName, id: { not: id } },
      });
      if (dup) {
        throw new ConflictException('An end-user with this name already exists in this section.');
      }
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.ppmpEndUser.update({
        where: { id },
        data: {
          ...(data.name ? { name: nextName } : {}),
          ...(data.departmentId ? { departmentId: data.departmentId } : {}),
          ...(data.position !== undefined ? { position: data.position?.trim() || null } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: END_USER_SELECT,
      }),
    );
  }
}
