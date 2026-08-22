import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CollectionTypeService } from './collection-type.service';

class UpdateCollectionTypeDto {
  @IsOptional()
  @IsUUID()
  glAccountId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresConsumer?: boolean;
}

@Controller('accounting/collection-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionTypeController {
  constructor(private readonly service: CollectionTypeService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.organizationId);
  }

  @Get('unmapped')
  @RequirePermissions('accounting.read')
  unmapped(@CurrentUser() user: AuthenticatedUser) {
    return this.service.unmapped(user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('accounting.coa.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCollectionTypeDto,
  ) {
    return this.service.update(user.organizationId, user.userId, id, dto);
  }
}
