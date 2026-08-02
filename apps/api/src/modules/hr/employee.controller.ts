import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

@Controller('hr/employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  @RequirePermissions('hr.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('employmentType') employmentType?: string,
    @Query('search') search?: string,
  ) {
    return this.employeeService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(employmentType ? { employmentType } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('hr.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeeService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('hr.employee.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(user.organizationId, dto, user.userId);
  }

  @Patch(':id')
  @RequirePermissions('hr.employee.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(user.organizationId, id, dto, user.userId);
  }
}
