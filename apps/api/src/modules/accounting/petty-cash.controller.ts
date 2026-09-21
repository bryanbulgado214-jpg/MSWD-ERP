import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import {
  CreatePettyCashFundDto,
  CreatePettyCashVoucherDto,
  PrepareReplenishmentDto,
  SetChargeAccountDto,
  UpdatePettyCashFundDto,
  UpdatePettyCashVoucherDto,
} from './dto/petty-cash.dto';
import { PettyCashService } from './petty-cash.service';

/**
 * Petty Cash Fund (imprest). Custodian (cashier, `operate`) records vouchers and
 * prepares replenishments; the accountant (`manage`) reviews and posts the
 * replenishment JEV. Both can read.
 */
@Controller('accounting/petty-cash')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PettyCashController {
  constructor(private readonly service: PettyCashService) {}

  // Expense accounts for the custodian's charge-account picker (read-level).
  @Get('expense-accounts')
  @RequirePermissions('accounting.petty_cash.read')
  expenseAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listExpenseAccounts(user.organizationId);
  }

  // ── Funds ──
  @Get('funds')
  @RequirePermissions('accounting.petty_cash.read')
  listFunds(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listFunds(user.organizationId);
  }

  @Get('funds/:id')
  @RequirePermissions('accounting.petty_cash.read')
  getFund(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFund(user.organizationId, id);
  }

  @Post('funds')
  @RequirePermissions('accounting.petty_cash.manage')
  createFund(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePettyCashFundDto) {
    return this.service.createFund(user.organizationId, user.userId, dto);
  }

  @Patch('funds/:id')
  @RequirePermissions('accounting.petty_cash.manage')
  updateFund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePettyCashFundDto,
  ) {
    return this.service.updateFund(user.organizationId, user.userId, id, dto);
  }

  // ── Vouchers (custodian) ──
  @Get('vouchers')
  @RequirePermissions('accounting.petty_cash.read')
  listVouchers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fundId') fundId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listVouchers(user.organizationId, fundId, status);
  }

  @Post('vouchers')
  @RequirePermissions('accounting.petty_cash.operate')
  createVoucher(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePettyCashVoucherDto) {
    return this.service.createVoucher(user.organizationId, user.userId, dto);
  }

  @Patch('vouchers/:id')
  @RequirePermissions('accounting.petty_cash.operate')
  updateVoucher(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePettyCashVoucherDto,
  ) {
    return this.service.updateVoucher(user.organizationId, user.userId, id, dto);
  }

  @Post('vouchers/:id/cancel')
  @RequirePermissions('accounting.petty_cash.operate')
  cancelVoucher(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelVoucher(user.organizationId, user.userId, id);
  }

  // Accountant assigns the expense account (at replenishment review).
  @Patch('vouchers/:id/charge-account')
  @RequirePermissions('accounting.petty_cash.manage')
  setChargeAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetChargeAccountDto,
  ) {
    return this.service.setVoucherChargeAccount(
      user.organizationId,
      user.userId,
      id,
      dto.chargeAccountId,
    );
  }

  // ── Replenishments ──
  @Get('replenishments')
  @RequirePermissions('accounting.petty_cash.read')
  listReplenishments(@CurrentUser() user: AuthenticatedUser, @Query('fundId') fundId?: string) {
    return this.service.listReplenishments(user.organizationId, fundId);
  }

  @Get('replenishments/:id')
  @RequirePermissions('accounting.petty_cash.read')
  getReplenishment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getReplenishment(user.organizationId, id);
  }

  @Post('replenishments')
  @RequirePermissions('accounting.petty_cash.operate')
  prepareReplenishment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrepareReplenishmentDto,
  ) {
    return this.service.prepareReplenishment(user.organizationId, user.userId, dto);
  }

  @Post('replenishments/:id/approve')
  @RequirePermissions('accounting.petty_cash.manage')
  approveReplenishment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.approveReplenishment(user.organizationId, user.userId, id);
  }

  @Post('replenishments/:id/cancel')
  @RequireAnyPermissions('accounting.petty_cash.operate', 'accounting.petty_cash.manage')
  cancelReplenishment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancelReplenishment(user.organizationId, user.userId, id);
  }
}
