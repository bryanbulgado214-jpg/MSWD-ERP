import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateOrsAdjustmentDto, CreateOrsChildDto, CreateOrsDto, OrsActionDto } from './dto/ors.dto';
import { OrsService } from './ors.service';

@Controller('procurement/ors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrsController {
  constructor(private readonly orsService: OrsService) {}

  @Get()
  @RequirePermissions('procurement.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('cafId') cafId?: string,
    @Query('purchaseRequestId') purchaseRequestId?: string,
  ) {
    return this.orsService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(cafId ? { cafId } : {}),
      ...(purchaseRequestId ? { purchaseRequestId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.ors.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrsDto,
  ) {
    return this.orsService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.ors.create')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrsActionDto,
  ) {
    return this.orsService.submitForRequestingCertification(
      user.organizationId, id, user.userId, dto.expectedVersion,
    );
  }

  @Post(':id/certify-requesting')
  @RequirePermissions('procurement.ors.requesting_certify')
  certifyRequesting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrsActionDto,
  ) {
    return this.orsService.certifyRequestingOffice(
      user.organizationId, id, user.userId, dto.expectedVersion,
    );
  }

  @Post(':id/certify-budget')
  @RequirePermissions('procurement.ors.budget_certify')
  certifyBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrsActionDto,
  ) {
    return this.orsService.certifyBudgetAndPostObligation(
      user.organizationId, id, user.userId, dto.expectedVersion,
    );
  }

  @Post(':id/children')
  @RequirePermissions('procurement.ors.create')
  addChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrsChildDto,
  ) {
    return this.orsService.addChild(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/adjustments')
  @RequirePermissions('procurement.ors.adjust')
  addAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrsAdjustmentDto,
  ) {
    return this.orsService.addAdjustment(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.ors.cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrsActionDto,
  ) {
    return this.orsService.cancel(
      user.organizationId, id, user.userId, dto.expectedVersion, dto.remarks,
    );
  }
}
