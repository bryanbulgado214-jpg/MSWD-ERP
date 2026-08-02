import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateMeterReadingDto, UpdateMeterReadingDto } from './dto/meter-reading.dto';
import { MeterReadingService } from './meter-reading.service';

@Controller('billing/readings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeterReadingController {
  constructor(private readonly meterReadingService: MeterReadingService) {}

  @Get()
  @RequirePermissions('billing.read')
  findByPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Query('billingPeriodId') billingPeriodId: string,
  ) {
    return this.meterReadingService.findByPeriod(user.organizationId, billingPeriodId);
  }

  @Get('unread')
  @RequirePermissions('billing.reading.manage')
  getUnreadConsumers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('billingPeriodId') billingPeriodId: string,
  ) {
    return this.meterReadingService.getUnreadConsumers(user.organizationId, billingPeriodId);
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.meterReadingService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.reading.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeterReadingDto) {
    return this.meterReadingService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('billing.reading.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMeterReadingDto) {
    return this.meterReadingService.update(user.organizationId, user.userId, id, dto);
  }
}
