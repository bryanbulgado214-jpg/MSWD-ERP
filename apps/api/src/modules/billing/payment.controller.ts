import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePaymentDto, VoidPaymentDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';

@Controller('billing/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @RequirePermissions('billing.read')
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Query('consumerId') consumerId?: string,
  ) {
    if (consumerId) return this.paymentService.findByConsumer(user.organizationId, consumerId);
    return this.paymentService.findRecent(user.organizationId);
  }

  @Get('next-or')
  @RequirePermissions('billing.payment.collect')
  nextOr(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentService.getNextOrNumber(user.organizationId);
  }

  @Get('unpaid-bills')
  @RequirePermissions('billing.payment.collect')
  unpaidBills(
    @CurrentUser() user: AuthenticatedUser,
    @Query('consumerId') consumerId: string,
  ) {
    return this.paymentService.getUnpaidBills(user.organizationId, consumerId);
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.payment.collect')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto) {
    return this.paymentService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/void')
  @RequirePermissions('billing.payment.void')
  voidPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoidPaymentDto,
  ) {
    return this.paymentService.voidPayment(user.organizationId, user.userId, id, dto.expectedVersion, dto.voidReason);
  }
}
