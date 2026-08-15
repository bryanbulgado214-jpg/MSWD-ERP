import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import type { OrganizationProfileService } from './organization-profile.service';

class UpdateOrganizationProfileDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(255) legalName?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(255) contact?: string;
  @IsOptional() @IsString() @MaxLength(1000) logoUrl?: string;
}

@Controller('admin/organization-profile')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationProfileController {
  constructor(private readonly profile: OrganizationProfileService) {}

  @Get()
  @RequirePermissions('core.organization.manage_settings')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.get(user.organizationId);
  }

  @Patch()
  @RequirePermissions('core.organization.manage_settings')
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationProfileDto) {
    return this.profile.update(user.organizationId, user.userId, dto);
  }
}
