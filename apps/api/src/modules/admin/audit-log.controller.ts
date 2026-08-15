import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @Get()
  @RequirePermissions('core.audit.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: string,
    @Query('tableName') tableName?: string,
    @Query('recordId') recordId?: string,
    @Query('performedBy') performedBy?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogs.list(user.organizationId, {
      ...(module ? { module } : {}),
      ...(tableName ? { tableName } : {}),
      ...(recordId ? { recordId } : {}),
      ...(performedBy ? { performedBy } : {}),
      ...(action ? { action } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(limit ? { limit: parseInt(limit, 10) } : {}),
    });
  }

  @Get('modules')
  @RequirePermissions('core.audit.read')
  modules() {
    return AuditLogService.modules();
  }

  @Get('actors')
  @RequirePermissions('core.audit.read')
  actors(@CurrentUser() user: AuthenticatedUser) {
    return this.auditLogs.actors(user.organizationId);
  }
}
