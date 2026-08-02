import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RemittanceService } from './remittance.service';

@Controller('hr/remittances')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RemittanceController {
  constructor(private readonly remittanceService: RemittanceService) {}

  @Get('summary')
  @RequirePermissions('hr.read')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('payrollRunId') payrollRunId?: string,
    @Query('payrollPeriodId') payrollPeriodId?: string,
    @Query('year') year?: string,
  ) {
    return this.remittanceService.getSummary(user.organizationId, {
      ...(payrollRunId ? { payrollRunId } : {}),
      ...(payrollPeriodId ? { payrollPeriodId } : {}),
      ...(year ? { year: Number(year) } : {}),
    });
  }

  @Get('agency/:code')
  @RequirePermissions('hr.read')
  getAgencyDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Query('payrollRunId') payrollRunId?: string,
    @Query('payrollPeriodId') payrollPeriodId?: string,
  ) {
    return this.remittanceService.getAgencyDetail(user.organizationId, code, {
      ...(payrollRunId ? { payrollRunId } : {}),
      ...(payrollPeriodId ? { payrollPeriodId } : {}),
    });
  }
}
