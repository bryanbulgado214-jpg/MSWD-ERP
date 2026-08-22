import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

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

class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

@Controller('accounting/collection-batches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionBatchController {
  constructor(private readonly service: CollectionBatchService) {}

  @Get()
  @RequirePermissions('collections.accounting.view')
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
  @RequirePermissions('collections.accounting.view')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getDetail(user.organizationId, id);
  }

  @Post('consolidate')
  @RequirePermissions('collections.accounting.review')
  consolidate(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConsolidateDto) {
    return this.service.consolidate(user.organizationId, user.userId, dto.date);
  }

  @Post(':id/review')
  @RequirePermissions('collections.accounting.review')
  review(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.review(user.organizationId, user.userId, id);
  }

  @Post(':id/approve')
  @RequirePermissions('collections.accounting.approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.approve(user.organizationId, user.userId, id);
  }

  @Post(':id/post')
  @RequirePermissions('collections.accounting.post')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.post(user.organizationId, user.userId, id);
  }

  @Post(':id/reject')
  @RequirePermissions('collections.accounting.review')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.service.reject(user.organizationId, user.userId, id, dto.reason);
  }

  @Post(':id/reverse')
  @RequirePermissions('collections.accounting.reverse')
  reverse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.service.reverse(user.organizationId, user.userId, id, dto.reason);
  }
}
