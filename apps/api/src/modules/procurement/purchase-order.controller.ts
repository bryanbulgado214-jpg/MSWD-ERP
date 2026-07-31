import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePurchaseOrderDto, PurchaseOrderActionDto, UpdatePurchaseOrderDto } from './dto/purchase-order.dto';
import { PurchaseOrderService } from './purchase-order.service';

@Controller('procurement/purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Get()
  @RequirePermissions('procurement.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('purchaseRequestId') purchaseRequestId?: string,
  ) {
    return this.purchaseOrderService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(purchaseRequestId ? { purchaseRequestId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchaseOrderService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.po.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrderService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('procurement.po.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrderService.update(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/submit-for-caf')
  @RequirePermissions('procurement.po.create')
  submitForCaf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseOrderActionDto,
  ) {
    return this.purchaseOrderService.submitForCaf(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.po.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseOrderActionDto,
  ) {
    return this.purchaseOrderService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.po.create')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseOrderActionDto,
  ) {
    return this.purchaseOrderService.cancel(user.organizationId, id, user.userId, dto.expectedVersion, dto.remarks);
  }
}
