import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ComplaintService } from './complaint.service';
import {
  AddComplaintNoteDto,
  AssignComplaintDto,
  CloseComplaintDto,
  CreateComplaintDto,
  LinkWorkOrderDto,
  ReopenComplaintDto,
  ResolveComplaintDto,
  UpdateComplaintDto,
} from './dto/complaint.dto';

@Controller('complaints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplaintController {
  constructor(private readonly complaintService: ComplaintService) {}

  @Get()
  @RequirePermissions('complaint.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('consumerId') consumerId?: string,
  ) {
    return this.complaintService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(search ? { search } : {}),
      ...(consumerId ? { consumerId } : {}),
    });
  }

  @Get('dashboard')
  @RequirePermissions('complaint.read')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.complaintService.getDashboardStats(user.organizationId);
  }

  @Get('reports')
  @RequirePermissions('complaint.reports')
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.complaintService.getReport(user.organizationId, {
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('complaint.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.complaintService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('complaint.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateComplaintDto) {
    return this.complaintService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('complaint.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateComplaintDto,
  ) {
    return this.complaintService.update(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions('complaint.assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignComplaintDto,
  ) {
    return this.complaintService.assign(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/start')
  @RequirePermissions('complaint.assign')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseComplaintDto,
  ) {
    return this.complaintService.startProgress(user.organizationId, user.userId, id, dto.expectedVersion);
  }

  @Post(':id/resolve')
  @RequirePermissions('complaint.resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveComplaintDto,
  ) {
    return this.complaintService.resolve(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/close')
  @RequirePermissions('complaint.close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseComplaintDto,
  ) {
    return this.complaintService.close(user.organizationId, user.userId, id, dto.expectedVersion);
  }

  @Post(':id/reopen')
  @RequirePermissions('complaint.resolve')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReopenComplaintDto,
  ) {
    return this.complaintService.reopen(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/notes')
  @RequirePermissions('complaint.read')
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddComplaintNoteDto,
  ) {
    return this.complaintService.addNote(user.organizationId, user.userId, id, dto.note, dto.isInternal);
  }

  @Post(':id/link-work-order')
  @RequirePermissions('complaint.assign')
  linkWorkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkWorkOrderDto,
  ) {
    return this.complaintService.linkWorkOrder(user.organizationId, user.userId, id, dto);
  }
}
