import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  CreateAllowanceTypeDto, UpdateAllowanceTypeDto,
  CreateDeductionTypeDto, UpdateDeductionTypeDto,
  CreateEmployeeAllowanceDto, UpdateEmployeeAllowanceDto,
  CreateEmployeeDeductionDto, UpdateEmployeeDeductionDto,
} from './dto/compensation.dto';
import { CompensationService } from './compensation.service';

@Controller('hr/compensation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompensationController {
  constructor(private readonly compensationService: CompensationService) {}

  // ── Allowance Types ──

  @Get('allowance-types')
  @RequirePermissions('hr.read')
  findAllowanceTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.compensationService.findAllowanceTypes(user.organizationId);
  }

  @Post('allowance-types')
  @RequirePermissions('hr.salary.manage')
  createAllowanceType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAllowanceTypeDto) {
    return this.compensationService.createAllowanceType(user.organizationId, dto);
  }

  @Patch('allowance-types/:id')
  @RequirePermissions('hr.salary.manage')
  updateAllowanceType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAllowanceTypeDto) {
    return this.compensationService.updateAllowanceType(user.organizationId, id, dto);
  }

  // ── Deduction Types ──

  @Get('deduction-types')
  @RequirePermissions('hr.read')
  findDeductionTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.compensationService.findDeductionTypes(user.organizationId);
  }

  @Post('deduction-types')
  @RequirePermissions('hr.salary.manage')
  createDeductionType(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDeductionTypeDto) {
    return this.compensationService.createDeductionType(user.organizationId, dto);
  }

  @Patch('deduction-types/:id')
  @RequirePermissions('hr.salary.manage')
  updateDeductionType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateDeductionTypeDto) {
    return this.compensationService.updateDeductionType(user.organizationId, id, dto);
  }

  // ── Employee Allowances ──

  @Get('employee-allowances/:employeeId')
  @RequirePermissions('hr.read')
  findEmployeeAllowances(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    return this.compensationService.findEmployeeAllowances(user.organizationId, employeeId);
  }

  @Post('employee-allowances')
  @RequirePermissions('hr.salary.manage')
  createEmployeeAllowance(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeAllowanceDto) {
    return this.compensationService.createEmployeeAllowance(user.organizationId, dto);
  }

  @Patch('employee-allowances/:id')
  @RequirePermissions('hr.salary.manage')
  updateEmployeeAllowance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateEmployeeAllowanceDto) {
    return this.compensationService.updateEmployeeAllowance(user.organizationId, id, dto);
  }

  // ── Employee Deductions ──

  @Get('employee-deductions/:employeeId')
  @RequirePermissions('hr.read')
  findEmployeeDeductions(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    return this.compensationService.findEmployeeDeductions(user.organizationId, employeeId);
  }

  @Post('employee-deductions')
  @RequirePermissions('hr.salary.manage')
  createEmployeeDeduction(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDeductionDto) {
    return this.compensationService.createEmployeeDeduction(user.organizationId, dto);
  }

  @Patch('employee-deductions/:id')
  @RequirePermissions('hr.salary.manage')
  updateEmployeeDeduction(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDeductionDto) {
    return this.compensationService.updateEmployeeDeduction(user.organizationId, id, dto);
  }
}
