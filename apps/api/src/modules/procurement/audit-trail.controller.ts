import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const PROCUREMENT_TABLES = new Set([
  'purchase_requests',
  'purchase_request_items',
  'purchase_orders',
  'certifications_of_availability',
  'obligation_requests',
  'ors_children',
  'ors_adjustments',
  'suppliers',
]);

@Controller('procurement/audit-trail')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditTrailController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('procurement.read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tableName') tableName?: string,
    @Query('recordId') recordId?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr || '50', 10) || 50, 200);

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      tableName: { in: Array.from(PROCUREMENT_TABLES) },
    };
    if (tableName && PROCUREMENT_TABLES.has(tableName)) {
      where.tableName = tableName;
    }
    if (recordId) {
      where.recordId = recordId;
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        performer: { select: { id: true, username: true } },
      },
      orderBy: { performedAt: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      tableName: log.tableName,
      recordId: log.recordId,
      action: log.action,
      changedFields: log.changedFields,
      performedBy: log.performer ? { id: log.performer.id, username: log.performer.username } : null,
      performedAt: log.performedAt.toISOString(),
    }));
  }

  @Get('record/:tableName/:recordId')
  @RequirePermissions('procurement.read')
  async forRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tableName') tableName: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
  ) {
    if (!PROCUREMENT_TABLES.has(tableName)) {
      return [];
    }

    const logs = await this.prisma.auditLog.findMany({
      where: {
        organizationId: user.organizationId,
        tableName,
        recordId,
      },
      include: {
        performer: { select: { id: true, username: true } },
      },
      orderBy: { performedAt: 'asc' },
    });

    return logs.map((log) => ({
      id: log.id,
      tableName: log.tableName,
      recordId: log.recordId,
      action: log.action,
      changedFields: log.changedFields,
      performedBy: log.performer ? { id: log.performer.id, username: log.performer.username } : null,
      performedAt: log.performedAt.toISOString(),
    }));
  }
}
