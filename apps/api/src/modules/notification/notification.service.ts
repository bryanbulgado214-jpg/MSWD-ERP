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
