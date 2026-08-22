import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CollectionBatchService } from './collection-batch.service';

class ConsolidateDto {
  @IsDateString()
  date!: string;
}

@Controller('accounting/collection-batches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionBatchController {
  constructor(private readonly service: CollectionBatchService) {}

  @Get()
  @RequirePermissions('accounting.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.list(user.organizationId, {
      ...(status ? { status } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getDetail(user.organizationId, id);
  }

  @Post('consolidate')
  @RequirePermissions('accounting.coa.manage')
  consolidate(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConsolidateDto) {
    return this.service.consolidate(user.organizationId, user.userId, dto.date);
  }

  @Post(':id/finalize')
  @RequirePermissions('accounting.coa.manage')
  finalize(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.finalize(user.organizationId, user.userId, id);
  }
}
