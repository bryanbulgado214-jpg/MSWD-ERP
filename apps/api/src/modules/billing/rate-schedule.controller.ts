import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateRateScheduleDto, UpdateRateScheduleDto } from './dto/rate-schedule.dto';
import { RateScheduleService } from './rate-schedule.service';

@Controller('billing/rate-schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RateScheduleController {
  constructor(private readonly rateScheduleService: RateScheduleService) {}

  @Get()
  @RequirePermissions('billing.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('consumerType') consumerType?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.rateScheduleService.findAll(user.organizationId, {
      ...(consumerType ? { consumerType } : {}),
      ...(activeOnly === 'true' ? { activeOnly: true } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rateScheduleService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.rate.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRateScheduleDto) {
    return this.rateScheduleService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('billing.rate.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateRateScheduleDto) {
    return this.rateScheduleService.update(user.organizationId, user.userId, id, dto);
  }
}
