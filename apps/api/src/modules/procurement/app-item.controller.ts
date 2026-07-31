import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AppItemService } from './app-item.service';

@Controller('procurement/app-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppItemController {
  constructor(private readonly appItemService: AppItemService) {}

  @Post()
  @RequirePermissions('procurement.app.manage')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      fiscalYearId: string;
      ppmpItemId: string;
      appNumber: string;
      procurementProjectTitle: string;
      procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
      approvedBudget: number | string;
      procurementMode?: string;
      scheduleMonth?: number;
    },
  ) {
    return this.appItemService.create(user.organizationId, {
      ...body,
      createdBy: user.userId,
    });
  }

  @Get()
  @RequirePermissions('procurement.read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('status') status?: string,
  ) {
    return this.appItemService.findAll(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appItemService.findOne(user.organizationId, id);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.app.manage')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appItemService.approve(user.organizationId, id, user.userId);
  }
}
