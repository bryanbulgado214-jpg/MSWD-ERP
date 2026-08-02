import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  CreatePayrollPeriodDto, LockPayrollPeriodDto,
  CreatePayrollRunDto, ComputePayrollDto,
  ApprovePayrollDto, PayPayrollDto, VoidPayrollDto,
  PayrollRunQueryDto, PayrollPeriodQueryDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@Controller('hr/payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // ── Periods ──

  @Get('periods')
  @RequirePermissions('hr.read')
  findPeriods(@CurrentUser() user: AuthenticatedUser, @Query() query: PayrollPeriodQueryDto) {
    return this.payrollService.findPeriods(user.organizationId, query);
  }

  @Post('periods')
  @RequirePermissions('hr.payroll.manage')
  createPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollPeriodDto) {
    return this.payrollService.createPeriod(user.organizationId, user.userId, dto);
  }

  @Patch('periods/:id/lock')
  @RequirePermissions('hr.payroll.manage')
  lockPeriod(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: LockPayrollPeriodDto) {
    return this.payrollService.lockPeriod(user.organizationId, user.userId, id, dto);
  }

  // ── Runs ──

  @Get('runs')
  @RequirePermissions('hr.read')
  findRuns(@CurrentUser() user: AuthenticatedUser, @Query() query: PayrollRunQueryDto) {
    return this.payrollService.findRuns(user.organizationId, query);
  }

  @Get('runs/:id')
  @RequirePermissions('hr.read')
  findRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payrollService.findRun(user.organizationId, id);
  }

  @Post('runs')
  @RequirePermissions('hr.payroll.manage')
  createRun(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollRunDto) {
    return this.payrollService.createRun(user.organizationId, user.userId, dto);
  }

  @Patch('runs/:id/compute')
  @RequirePermissions('hr.payroll.manage')
  computeRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ComputePayrollDto) {
    return this.payrollService.computeRun(user.organizationId, user.userId, id, dto);
  }

  @Patch('runs/:id/approve')
  @RequirePermissions('hr.payroll.approve')
  approveRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApprovePayrollDto) {
    return this.payrollService.approveRun(user.organizationId, user.userId, id, dto);
  }

  @Patch('runs/:id/pay')
  @RequirePermissions('hr.payroll.manage')
  payRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayPayrollDto) {
    return this.payrollService.payRun(user.organizationId, user.userId, id, dto);
  }

  @Patch('runs/:id/void')
  @RequirePermissions('hr.payroll.manage')
  voidRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: VoidPayrollDto) {
    return this.payrollService.voidRun(user.organizationId, user.userId, id, dto);
  }
}
