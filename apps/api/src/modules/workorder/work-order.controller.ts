import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  AddWorkOrderMaterialDto,
  AddWorkOrderNoteDto,
  AssignWorkOrderDto,
  CancelWorkOrderDto,
  CompleteWorkOrderDto,
  CreateWorkOrderDto,
  StartWorkOrderDto,
  UpdateWorkOrderDto,
  VerifyWorkOrderDto,
} from './dto/work-order.dto';
import { WorkOrderService } from './work-order.service';

@Controller('workorders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrderController {
  constructor(private readonly workOrderService: WorkOrderService) {}

  @Get()
  @RequirePermissions('workorder.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('search') search?: string,
  ) {
    return this.workOrderService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get('dashboard')
  @RequirePermissions('workorder.read')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.workOrderService.getDashboardStats(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('workorder.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workOrderService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('workorder.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkOrderDto) {
    return this.workOrderService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('workorder.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.workOrderService.update(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions('workorder.assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignWorkOrderDto,
  ) {
    return this.workOrderService.assign(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/start')
  @RequirePermissions('workorder.execute')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StartWorkOrderDto,
  ) {
    return this.workOrderService.start(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('workorder.execute')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteWorkOrderDto,
  ) {
    return this.workOrderService.complete(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/verify')
  @RequirePermissions('workorder.verify')
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyWorkOrderDto,
  ) {
    return this.workOrderService.verify(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('workorder.create')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelWorkOrderDto,
  ) {
    return this.workOrderService.cancel(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/notes')
  @RequirePermissions('workorder.read')
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddWorkOrderNoteDto,
  ) {
    return this.workOrderService.addNote(user.organizationId, user.userId, id, dto.note);
  }

  @Post(':id/materials')
  @RequirePermissions('workorder.execute')
  addMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddWorkOrderMaterialDto,
  ) {
    return this.workOrderService.addMaterial(user.organizationId, id, dto);
  }

  @Delete(':id/materials/:materialId')
  @RequirePermissions('workorder.execute')
  removeMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('materialId') materialId: string,
  ) {
    return this.workOrderService.removeMaterial(user.organizationId, id, materialId);
  }
}
