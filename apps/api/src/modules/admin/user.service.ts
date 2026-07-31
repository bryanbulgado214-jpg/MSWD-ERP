import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          select: {
            id: true,
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { username: 'asc' },
    });
    return users.map((u) => ({
      ...u,
      roles: u.userRoles.map((ur) => ({ assignmentId: ur.id, ...ur.role })),
      userRoles: undefined,
    }));
  }

  async findOne(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            id: true,
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    return {
      ...user,
      roles: user.userRoles.map((ur) => ({ assignmentId: ur.id, ...ur.role })),
      userRoles: undefined,
    };
  }

  async create(organizationId: string, actorId: string, data: { username: string; email: string; password: string; isActive?: boolean }) {
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, OR: [{ username: data.username }, { email: data.email }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === data.username ? 'Username already taken.' : 'Email already in use.',
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    return runAudited(this.prisma, actorId, async (tx) => {
      return tx.user.create({
        data: {
          organizationId,
          username: data.username,
          email: data.email,
          passwordHash,
          isActive: data.isActive ?? true,
        },
        select: { id: true, username: true, email: true, isActive: true, createdAt: true },
      });
    });
  }

  async update(organizationId: string, actorId: string, userId: string, data: { email?: string; password?: string; isActive?: boolean }) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!user) throw new NotFoundException('User not found.');

    if (data.email && data.email !== user.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { organizationId, email: data.email, id: { not: userId } },
      });
      if (emailTaken) throw new ConflictException('Email already in use.');
    }

    return runAudited(this.prisma, actorId, async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (data.email) updateData.email = data.email;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);

      return tx.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, username: true, email: true, isActive: true, updatedAt: true },
      });
    });
  }

  async assignRole(organizationId: string, actorId: string, userId: string, roleId: string) {
    const [user, role] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, organizationId } }),
      this.prisma.role.findFirst({ where: { id: roleId, organizationId } }),
    ]);
    if (!user) throw new NotFoundException('User not found.');
    if (!role) throw new NotFoundException('Role not found.');

    const rootUnit = await this.prisma.organizationalUnit.findFirst({
      where: { organizationId, parentUnitId: null },
    });

    const existing = await this.prisma.userRole.findFirst({
      where: { userId, roleId, organizationalUnitId: rootUnit?.id ?? '' },
    });
    if (existing) throw new ConflictException('Role already assigned to this user.');

    return runAudited(this.prisma, actorId, async (tx) => {
      return tx.userRole.create({
        data: {
          userId,
          roleId,
          organizationalUnitId: rootUnit!.id,
          createdBy: actorId,
        },
        select: { id: true, role: { select: { id: true, code: true, name: true } } },
      });
    });
  }

  async revokeRole(organizationId: string, actorId: string, userId: string, assignmentId: string) {
    const assignment = await this.prisma.userRole.findFirst({
      where: { id: assignmentId, userId },
      include: { user: { select: { organizationId: true } } },
    });
    if (!assignment || assignment.user.organizationId !== organizationId) {
      throw new NotFoundException('Role assignment not found.');
    }

    return runAudited(this.prisma, actorId, async (tx) => {
      await tx.userRole.delete({ where: { id: assignmentId } });
      return { removed: true };
    });
  }
}
