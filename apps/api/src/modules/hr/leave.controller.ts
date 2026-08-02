import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApproveLeaveDto, CancelLeaveDto, CreateLeaveApplicationDto, InitLeaveBalancesDto, RejectLeaveDto } from './dto/leave.dto';
import { LeaveService } from './leave.service';

@Controller('hr/leave')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  @RequirePermissions('hr.read')
  findTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.findLeaveTypes(user.organizationId);
  }

  @Get('balances/:employeeId')
  @RequirePermissions('hr.read')
  findBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.leaveService.findLeaveBalances(
      user.organizationId,
      employeeId,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Post('balances/init')
  @RequirePermissions('hr.leave.manage')
  initBalances(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitLeaveBalancesDto) {
    return this.leaveService.initializeBalances(user.organizationId, dto.employeeId, dto.year);
  }

  @Get('applications')
  @RequirePermissions('hr.read')
  findApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
  ) {
    return this.leaveService.findApplications(user.organizationId, {
      ...(employeeId ? { employeeId } : {}),
      ...(status ? { status } : {}),
      ...(year ? { year: parseInt(year, 10) } : {}),
    });
  }

  @Get('applications/:id')
  @RequirePermissions('hr.read')
  findApplication(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leaveService.findApplication(user.organizationId, id);
  }

  @Post('applications')
  @RequirePermissions('hr.leave.manage')
  createApplication(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveApplicationDto) {
    return this.leaveService.createApplication(user.organizationId, dto, user.userId);
  }

  @Patch('applications/:id/approve')
  @RequirePermissions('hr.leave.approve')
  approveApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.leaveService.approveApplication(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Patch('applications/:id/reject')
  @RequirePermissions('hr.leave.approve')
  rejectApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
  ) {
    return this.leaveService.rejectApplication(user.organizationId, id, dto.expectedVersion, dto.rejectionReason, user.userId);
  }

  @Patch('applications/:id/cancel')
  @RequirePermissions('hr.leave.manage')
  cancelApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelLeaveDto,
  ) {
    return this.leaveService.cancelApplication(user.organizationId, id, dto.expectedVersion, user.userId);
  }
}
