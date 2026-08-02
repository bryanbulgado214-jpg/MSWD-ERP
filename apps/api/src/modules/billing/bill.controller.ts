import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BillService } from './bill.service';
import { GenerateBillsDto } from './dto/bill.dto';

@Controller('billing/bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillController {
  constructor(private readonly billService: BillService) {}

  @Get()
  @RequirePermissions('billing.read')
  findByPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Query('billingPeriodId') billingPeriodId?: string,
    @Query('consumerId') consumerId?: string,
  ) {
    if (consumerId) return this.billService.findByConsumer(user.organizationId, consumerId);
    if (billingPeriodId) return this.billService.findByPeriod(user.organizationId, billingPeriodId);
    return [];
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.billService.findOne(user.organizationId, id);
  }

  @Post('generate')
  @RequirePermissions('billing.bill.generate')
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateBillsDto) {
    return this.billService.generateBills(user.organizationId, user.userId, dto.billingPeriodId);
  }
}
