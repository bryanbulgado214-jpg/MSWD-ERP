import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePropertyRecordDto, UpdatePropertyRecordDto } from './dto/property-record.dto';
import { PropertyRecordService } from './property-record.service';

@Controller('inventory/property-records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PropertyRecordController {
  constructor(private readonly propertyService: PropertyRecordService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('condition') condition?: string,
    @Query('accountableUserId') accountableUserId?: string,
    @Query('includeDisposed') includeDisposed?: string,
    @Query('search') search?: string,
  ) {
    return this.propertyService.findAll(user.organizationId, {
      ...(condition ? { condition } : {}),
      ...(accountableUserId ? { accountableUserId } : {}),
      includeDisposed: includeDisposed === 'true',
      ...(search ? { search } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.propertyService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.property.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePropertyRecordDto,
  ) {
    return this.propertyService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.property.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyRecordDto,
  ) {
    return this.propertyService.update(user.organizationId, id, user.userId, dto);
  }
}
