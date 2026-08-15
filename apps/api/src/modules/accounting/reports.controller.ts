import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { AccountingReportsService } from './reports.service';

@Controller('accounting/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingReportsController {
  constructor(private readonly reportsService: AccountingReportsService) {}

  @Get('ap-aging')
  @RequirePermissions('accounting.reports')
  apAging(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.apAging(user.organizationId);
  }

  @Get('cash-activity')
  @RequirePermissions('accounting.reports')
  cashActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.reportsService.cashActivity(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(periodId ? { periodId } : {}),
    });
  }
}
