import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { InventoryClassification } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateInventoryItemDto, UpdateInventoryItemDto } from './dto/inventory-item.dto';
import { InventoryItemService } from './inventory-item.service';

@Controller('inventory/items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryItemController {
  constructor(private readonly itemService: InventoryItemService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classification') classification?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('search') search?: string,
  ) {
    return this.itemService.findAll(user.organizationId, {
      ...(classification ? { classification: classification as InventoryClassification } : {}),
      includeInactive: includeInactive === 'true',
      ...(search ? { search } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.itemService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.item.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.itemService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.item.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.itemService.update(user.organizationId, id, user.userId, dto);
  }
}
