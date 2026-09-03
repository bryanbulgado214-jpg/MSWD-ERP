import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  title: string;
  body?: string;
  linkUrl?: string;
  relatedTable?: string;
  relatedId?: string;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        title: input.title,
        ...(input.body ? { body: input.body } : {}),
        ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}),
        ...(input.relatedTable ? { relatedTable: input.relatedTable } : {}),
        ...(input.relatedId ? { relatedId: input.relatedId } : {}),
      },
    });
  }

  async notifyUsersWithRole(
    organizationId: string,
    roleCode: string,
    notification: Omit<CreateNotificationInput, 'organizationId' | 'userId'>,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { organizationId, code: roleCode },
    });
    if (!role) return;

    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId: role.id },
      select: { userId: true },
    });

    const uniqueUserIds = [...new Set(userRoles.map((ur) => ur.userId))];

    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        organizationId,
        userId,
        title: notification.title,
        body: notification.body ?? null,
        linkUrl: notification.linkUrl ?? null,
        relatedTable: notification.relatedTable ?? null,
        relatedId: notification.relatedId ?? null,
      })),
    });
  }

  /**
   * Every user in the org who holds a permission code — whether via a role or a
   * direct per-user grant. Lets us notify "whoever can review/post" without
   * depending on a specific role name (live access is granted per-user).
   */
  async findUserIdsWithPermission(organizationId: string, code: string): Promise<string[]> {
    const perm = await this.prisma.permission.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!perm) return [];
    const [viaRole, viaDirect] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { role: { organizationId, rolePermissions: { some: { permissionId: perm.id } } } },
        select: { userId: true },
      }),
      this.prisma.userPermission.findMany({
        where: { permissionId: perm.id, user: { organizationId } },
        select: { userId: true },
      }),
    ]);
    return [...new Set([...viaRole.map((r) => r.userId), ...viaDirect.map((d) => d.userId)])];
  }

  /**
   * Notify every user holding `permissionCode`, optionally excluding one user
   * (typically the person who triggered the event, so they don't notify
   * themselves). No-op when nobody holds the permission.
   */
  async notifyUsersWithPermission(
    organizationId: string,
    permissionCode: string,
    notification: Omit<CreateNotificationInput, 'organizationId' | 'userId'>,
    excludeUserId?: string,
  ) {
    const userIds = (await this.findUserIdsWithPermission(organizationId, permissionCode)).filter(
      (id) => id !== excludeUserId,
    );
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        organizationId,
        userId,
        title: notification.title,
        body: notification.body ?? null,
        linkUrl: notification.linkUrl ?? null,
        relatedTable: notification.relatedTable ?? null,
        relatedId: notification.relatedId ?? null,
      })),
    });
  }

  async listForUser(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number },
  ) {
    const where: { userId: string; isRead?: boolean } = { userId };
    if (options?.unreadOnly) where.isRead = false;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(notificationId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
