import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { PostInventoryGlDto, VoidInventoryGlDto } from './dto/inventory-gl.dto';
import { InventoryGlService } from './inventory-gl.service';

/**
 * Month-end inventory JEV (RSMI) — the stock-card personnel's monthly trigger.
 * All endpoints require inventory.gl.post.
 */
@Controller('inventory/gl')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryGlController {
  constructor(private readonly glService: InventoryGlService) {}

  @Get('runs')
  @RequirePermissions('inventory.gl.post')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.glService.list(user.organizationId);
  }

  @Get('preview')
  @RequirePermissions('inventory.gl.post')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.glService.preview(user.organizationId, Number(month), Number(year));
  }

  @Post('post')
  @RequirePermissions('inventory.gl.post')
  post(@CurrentUser() user: AuthenticatedUser, @Body() dto: PostInventoryGlDto) {
    return this.glService.post(user.organizationId, user.userId, dto.month, dto.year);
  }

  @Post('runs/:id/void')
  @RequirePermissions('inventory.gl.post')
  void(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInventoryGlDto,
  ) {
    return this.glService.void(user.organizationId, user.userId, id, dto.expectedVersion);
  }
}
