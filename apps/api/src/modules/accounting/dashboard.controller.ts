import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import type { AccountingDashboardService } from './dashboard.service';

@Controller('accounting/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingDashboardController {
  constructor(private readonly dashboard: AccountingDashboardService) {}

  @Get()
  @RequirePermissions('accounting.read')
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.dashboard.getDashboard(user.organizationId, fiscalYearId);
  }
}
