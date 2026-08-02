import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { HrReportsService } from './hr-reports.service';

@Controller('hr/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HrReportsController {
  constructor(private readonly reportsService: HrReportsService) {}

  @Get('employee-roster')
  @RequirePermissions('hr.read')
  getEmployeeRoster(
    @CurrentUser() user: AuthenticatedUser,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
  ) {
    return this.reportsService.getEmployeeRoster(user.organizationId, {
      ...(departmentId ? { departmentId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get('payroll-register/:runId')
  @RequirePermissions('hr.read')
  getPayrollRegister(@CurrentUser() user: AuthenticatedUser, @Param('runId') runId: string) {
    return this.reportsService.getPayrollRegister(user.organizationId, runId);
  }

  @Get('leave-summary')
  @RequirePermissions('hr.read')
  getLeaveSummary(@CurrentUser() user: AuthenticatedUser, @Query('year') year?: string) {
    return this.reportsService.getLeaveSummary(user.organizationId, {
      ...(year ? { year: Number(year) } : {}),
    });
  }

  @Get('payslip/:itemId')
  @RequirePermissions('hr.read')
  getPayslip(@CurrentUser() user: AuthenticatedUser, @Param('itemId') itemId: string) {
    return this.reportsService.getPayslip(user.organizationId, itemId);
  }

  @Get('attendance-summary')
  @RequirePermissions('hr.read')
  getAttendanceSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const now = new Date();
    return this.reportsService.getAttendanceSummary(user.organizationId, {
      month: month ? Number(month) : now.getMonth() + 1,
      year: year ? Number(year) : now.getFullYear(),
    });
  }
}
