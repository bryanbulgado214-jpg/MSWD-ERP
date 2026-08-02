import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccountMappingService } from './account-mapping.service';

class UpsertAccountMappingDto {
  @IsString()
  @MinLength(1)
  mappingKey!: string;

  @IsString()
  chartOfAccountId!: string;
}

@Controller('accounting/mappings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountMappingController {
  constructor(private readonly mappingService: AccountMappingService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.mappingService.findAll(user.organizationId);
  }

  @Post()
  @RequirePermissions('accounting.coa.manage')
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAccountMappingDto,
  ) {
    return this.mappingService.upsert(user.organizationId, user.userId, dto);
  }
}
