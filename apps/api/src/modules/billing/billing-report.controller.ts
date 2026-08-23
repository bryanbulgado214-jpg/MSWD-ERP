import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { BillingReportService } from './billing-report.service';

@Controller('billing/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingReportController {
  constructor(private readonly reportService: BillingReportService) {}

  @Get('collection-summary')
  @RequireAnyPermissions('billing.reports', 'billing.reports.view')
  collectionSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportService.getCollectionSummary(user.organizationId, startDate, endDate);
  }

  @Get('aging')
  @RequireAnyPermissions('billing.reports', 'billing.reports.view')
  aging(@CurrentUser() user: AuthenticatedUser) {
    return this.reportService.getAgingReport(user.organizationId);
  }

  @Get('consumer-ledger')
  @RequireAnyPermissions('billing.reports', 'billing.reports.view')
  consumerLedger(@CurrentUser() user: AuthenticatedUser, @Query('consumerId') consumerId: string) {
    return this.reportService.getConsumerLedger(user.organizationId, consumerId);
  }

  @Get('billing-summary')
  @RequireAnyPermissions('billing.reports', 'billing.reports.view')
  billingSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('billingPeriodId') billingPeriodId?: string,
  ) {
    return this.reportService.getBillingSummary(user.organizationId, billingPeriodId);
  }
}
