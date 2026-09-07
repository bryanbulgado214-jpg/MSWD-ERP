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
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { BankService } from './bank.service';
import {
  CreateBankAccountDto,
  CreateBankDto,
  UpdateBankAccountDto,
  UpdateBankDto,
  UpdateCheckLayoutDto,
} from './dto/bank.dto';

@Controller('accounting/banks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankController {
  constructor(private readonly bankService: BankService) {}

  // ── Banks ──

  @Get()
  @RequirePermissions('accounting.read')
  findAllBanks(@CurrentUser() user: AuthenticatedUser) {
    return this.bankService.findAllBanks(user.organizationId);
  }

  @Post()
  @RequirePermissions('accounting.bank.manage')
  createBank(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankDto) {
    return this.bankService.createBank(user.organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions('accounting.bank.manage')
  updateBank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankDto,
  ) {
    return this.bankService.updateBank(user.organizationId, id, dto);
  }

  // ── Bank Accounts ──

  @Get('accounts')
  @RequirePermissions('accounting.read')
  findAllBankAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bankId') bankId?: string,
    @Query('status') status?: string,
  ) {
    return this.bankService.findAllBankAccounts(user.organizationId, {
      ...(bankId ? { bankId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get('accounts/:id')
  @RequirePermissions('accounting.read')
  findOneBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bankService.findOneBankAccount(user.organizationId, id);
  }

  @Post('accounts')
  @RequirePermissions('accounting.bank.manage')
  createBankAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankAccountDto) {
    return this.bankService.createBankAccount(user.organizationId, user.userId, dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('accounting.bank.manage')
  updateBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankService.updateBankAccount(user.organizationId, id, user.userId, dto);
  }

  // ── Check-printing alignment (cashier) ──
  // These sit under the check-print permission, not bank management, so the
  // cashier who prints checks can calibrate the layout without being able to
  // touch the rest of the bank-account master.

  /** Bank accounts the cashier can calibrate check printing for. Same shape as
   * the accountant's list (includes the saved checkLayout), but reachable with
   * only the check-print permission. */
  @Get('accounts-for-check-printing')
  @RequirePermissions('accounting.check.print')
  findBankAccountsForCheckPrinting(@CurrentUser() user: AuthenticatedUser) {
    return this.bankService.findAllBankAccounts(user.organizationId);
  }

  /** Save the check-printing layout for one bank account (Check Alignment). */
  @Patch('accounts/:id/check-layout')
  @RequirePermissions('accounting.check.print')
  updateCheckLayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCheckLayoutDto,
  ) {
    return this.bankService.updateCheckLayout(
      user.organizationId,
      id,
      user.userId,
      dto.checkLayout,
    );
  }
}
