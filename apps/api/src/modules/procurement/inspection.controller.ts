import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateInspectionReportDto, InspectionActionDto } from './dto/inspection.dto';
import { InspectionService } from './inspection.service';

@Controller('procurement/inspections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InspectionController {
  constructor(private readonly inspectionService: InspectionService) {}

  @Get()
  @RequirePermissions('procurement.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('purchaseOrderId') purchaseOrderId?: string,
    @Query('status') status?: string,
  ) {
    return this.inspectionService.list(user.organizationId, {
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inspectionService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.inspection.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInspectionReportDto,
  ) {
    return this.inspectionService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.inspection.create')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InspectionActionDto,
  ) {
    return this.inspectionService.submit(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/accept')
  @RequirePermissions('procurement.inspection.accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InspectionActionDto,
  ) {
    return this.inspectionService.accept(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/reject')
  @RequirePermissions('procurement.inspection.accept')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InspectionActionDto,
  ) {
    return this.inspectionService.reject(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }
}
