import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { ImportOpeningBalancesDto, PreviewOpeningBalancesDto } from './dto/opening-balance.dto';
import { GlService } from './gl.service';

@Controller('accounting/gl')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GlController {
  constructor(private readonly glService: GlService) {}

  @Get('trial-balance')
  @RequirePermissions('accounting.read')
  getTrialBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodId') periodId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.glService.getTrialBalance(user.organizationId, {
      ...(periodId ? { periodId } : {}),
      ...(fiscalYearId ? { fiscalYearId } : {}),
    });
  }

  @Get('general-ledger')
  @RequirePermissions('accounting.read')
  getGeneralLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('accountType') accountType?: string,
  ) {
    return this.glService.getGeneralLedger(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(accountType ? { accountType } : {}),
    });
  }

  @Get('subsidiary/:accountId')
  @RequirePermissions('accounting.read')
  getSubsidiaryLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.glService.getSubsidiaryLedger(user.organizationId, accountId, {
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(periodId ? { periodId } : {}),
    });
  }

  @Get('fiscal-years')
  @RequirePermissions('accounting.read')
  getFiscalYears(@CurrentUser() user: AuthenticatedUser) {
    return this.glService.getFiscalYears(user.organizationId);
  }

  @Get('periods/:fiscalYearId')
  @RequirePermissions('accounting.read')
  getPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fiscalYearId', ParseUUIDPipe) fiscalYearId: string,
  ) {
    return this.glService.getPeriodsByFiscalYear(user.organizationId, fiscalYearId);
  }

  @Get('accounts')
  @RequirePermissions('accounting.read')
  getPostableAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.glService.getPostableAccounts(user.organizationId);
  }

  @Get('settings')
  @RequirePermissions('accounting.read')
  getAccountingSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.glService.getAccountingSettings(user.organizationId);
  }

  @Post('opening-balances/preview')
  @RequirePermissions('accounting.jev.create')
  previewOpeningBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewOpeningBalancesDto,
  ) {
    return this.glService.previewOpeningBalances(user.organizationId, dto.csv);
  }

  @Post('opening-balances/import')
  @RequirePermissions('accounting.jev.create')
  importOpeningBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportOpeningBalancesDto,
  ) {
    return this.glService.importOpeningBalances(
      user.organizationId,
      user.userId,
      dto.csv,
      dto.asOfDate,
    );
  }
}
