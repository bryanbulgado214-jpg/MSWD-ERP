import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateStockReceiptDto, PostStockReceiptDto } from './dto/stock-receipt.dto';
import { StockReceiptService } from './stock-receipt.service';

@Controller('inventory/stock-receipts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockReceiptController {
  constructor(private readonly receiptService: StockReceiptService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.receiptService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receiptService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.receipt.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockReceiptDto,
  ) {
    return this.receiptService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/post')
  @RequirePermissions('inventory.receipt.manage')
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostStockReceiptDto,
  ) {
    return this.receiptService.post(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.receipt.manage')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostStockReceiptDto,
  ) {
    return this.receiptService.cancel(user.organizationId, id, user.userId, dto.expectedVersion);
  }
}
