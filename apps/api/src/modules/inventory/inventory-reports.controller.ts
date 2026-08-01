import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { InventoryReportsService } from './inventory-reports.service';

@Controller('inventory/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryReportsController {
  constructor(private readonly reportsService: InventoryReportsService) {}

  @Get('stock-card/:inventoryItemId')
  @RequirePermissions('inventory.read')
  getStockCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inventoryItemId', ParseUUIDPipe) inventoryItemId: string,
  ) {
    return this.reportsService.getStockCardReport(user.organizationId, inventoryItemId);
  }

  @Get('rsmi')
  @RequirePermissions('inventory.reports')
  getRsmi(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getRsmi(user.organizationId, startDate, endDate);
  }

  @Get('rpci/:physicalCountId')
  @RequirePermissions('inventory.reports')
  getRpci(
    @CurrentUser() user: AuthenticatedUser,
    @Param('physicalCountId', ParseUUIDPipe) physicalCountId: string,
  ) {
    return this.reportsService.getRpci(user.organizationId, physicalCountId);
  }

  @Get('property-ledger')
  @RequirePermissions('inventory.reports')
  getPropertyLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classification') classification?: string,
    @Query('accountableUserId') accountableUserId?: string,
  ) {
    return this.reportsService.getPropertyLedger(user.organizationId, {
      ...(classification ? { classification } : {}),
      ...(accountableUserId ? { accountableUserId } : {}),
    });
  }

  @Get('summary')
  @RequirePermissions('inventory.read')
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getInventorySummary(user.organizationId);
  }
}
