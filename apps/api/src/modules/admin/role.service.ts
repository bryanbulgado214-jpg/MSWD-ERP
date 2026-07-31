import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.role.findMany({
      where: { organizationId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystemRole: true,
        isActive: true,
        _count: { select: { userRoles: true, rolePermissions: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(organizationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystemRole: true,
        isActive: true,
        rolePermissions: {
          select: {
            id: true,
            permission: { select: { id: true, code: true, name: true, module: true } },
          },
        },
        userRoles: {
          select: {
            id: true,
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('Role not found.');
    return {
      ...role,
      permissions: role.rolePermissions.map((rp) => ({ assignmentId: rp.id, ...rp.permission })),
      users: role.userRoles.map((ur) => ({ assignmentId: ur.id, ...ur.user })),
      rolePermissions: undefined,
      userRoles: undefined,
    };
  }

  async addPermission(organizationId: string, actorId: string, roleId: string, permissionId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, organizationId } });
    if (!role) throw new NotFoundException('Role not found.');

    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) throw new NotFoundException('Permission not found.');

    const existing = await this.prisma.rolePermission.findFirst({ where: { roleId, permissionId } });
    if (existing) throw new ConflictException('Permission already assigned to this role.');

    return runAudited(this.prisma, actorId, async (tx) => {
      return tx.rolePermission.create({
        data: { roleId, permissionId, createdBy: actorId },
        select: { id: true, permission: { select: { id: true, code: true, name: true, module: true } } },
      });
    });
  }

  async removePermission(organizationId: string, actorId: string, roleId: string, assignmentId: string) {
    const rp = await this.prisma.rolePermission.findFirst({
      where: { id: assignmentId, roleId },
      include: { role: { select: { organizationId: true } } },
    });
    if (!rp || rp.role.organizationId !== organizationId) {
      throw new NotFoundException('Permission assignment not found.');
    }

    return runAudited(this.prisma, actorId, async (tx) => {
      await tx.rolePermission.delete({ where: { id: assignmentId } });
      return { removed: true };
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      select: { id: true, code: true, name: true, module: true },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }
}
