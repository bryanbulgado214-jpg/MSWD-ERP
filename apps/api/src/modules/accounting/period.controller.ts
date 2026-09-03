import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CreateFiscalYearDto, PeriodActionDto } from './dto/period.dto';
import { PeriodService } from './period.service';

@Controller('accounting/periods')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Get('fiscal-years')
  @RequirePermissions('accounting.read')
  getFiscalYears(@CurrentUser() user: AuthenticatedUser) {
    return this.periodService.getFiscalYears(user.organizationId);
  }

  @Post('fiscal-years')
  @RequireAnyPermissions('accounting.period.manage', 'accounting.bank.manage')
  createFiscalYear(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFiscalYearDto) {
    return this.periodService.createFiscalYear(user.organizationId, user.userId, dto);
  }

  @Post('fiscal-years/:id/close')
  @RequireAnyPermissions('accounting.period.manage', 'accounting.bank.manage')
  closeFiscalYear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodActionDto,
  ) {
    return this.periodService.closeFiscalYear(
      user.organizationId,
      id,
      user.userId,
      dto.expectedVersion,
    );
  }

  @Get(':fiscalYearId')
  @RequirePermissions('accounting.read')
  getPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fiscalYearId', ParseUUIDPipe) fiscalYearId: string,
  ) {
    return this.periodService.getPeriods(user.organizationId, fiscalYearId);
  }

  @Post(':id/lock')
  @RequireAnyPermissions('accounting.period.manage', 'accounting.bank.manage')
  lockPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodActionDto,
  ) {
    return this.periodService.lockPeriod(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/unlock')
  @RequireAnyPermissions('accounting.period.manage', 'accounting.bank.manage')
  unlockPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodActionDto,
  ) {
    return this.periodService.unlockPeriod(
      user.organizationId,
      id,
      user.userId,
      dto.expectedVersion,
    );
  }

  @Post(':id/close')
  @RequireAnyPermissions('accounting.period.manage', 'accounting.bank.manage')
  closePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodActionDto,
  ) {
    return this.periodService.closePeriod(
      user.organizationId,
      id,
      user.userId,
      dto.expectedVersion,
    );
  }

  @Post(':id/reopen')
  @RequireAnyPermissions('accounting.period.manage', 'accounting.bank.manage')
  reopenPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodActionDto,
  ) {
    return this.periodService.reopenPeriod(
      user.organizationId,
      id,
      user.userId,
      dto.expectedVersion,
    );
  }
}
