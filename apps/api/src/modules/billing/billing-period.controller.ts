import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BillingPeriodService } from './billing-period.service';
import { CreateBillingPeriodDto, TransitionPeriodDto, UpdateBillingPeriodDto } from './dto/billing-period.dto';

@Controller('billing/periods')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingPeriodController {
  constructor(private readonly billingPeriodService: BillingPeriodService) {}

  @Get()
  @RequirePermissions('billing.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('year') year?: string,
  ) {
    return this.billingPeriodService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(year ? { year: parseInt(year, 10) } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.billingPeriodService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.period.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBillingPeriodDto) {
    return this.billingPeriodService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('billing.period.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateBillingPeriodDto) {
    return this.billingPeriodService.update(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/transition')
  @RequirePermissions('billing.period.manage')
  transition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: TransitionPeriodDto) {
    return this.billingPeriodService.transition(user.organizationId, user.userId, id, dto);
  }
}
