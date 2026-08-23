import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CollectionReportsService } from './collection-reports.service';

@Controller('accounting/collections/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionReportsController {
  constructor(private readonly service: CollectionReportsService) {}

  @Get()
  @RequireAnyPermissions('accounting.read', 'collections.accounting.view')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Query('kind') kind: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.run(user.organizationId, kind ?? 'daily-summary', from, to);
  }
}
