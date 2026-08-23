import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { TellerSessionService } from './teller-session.service';

class RemitDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualCashRemitted!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualChecksRemitted!: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  // Denomination → quantity, e.g. { "1000": 2, "500": 3 }.
  @IsOptional()
  @IsObject()
  cashCount?: Record<string, number>;
}

class ReceiveDto {
  @IsOptional()
  @IsString()
  remarks?: string;
}

// Teller drives their own session; the cashier receives remittances.
const TELLER = 'billing.session.manage';
const CASHIER = 'collections.remittance.receive';

@Controller('billing/teller-sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TellerSessionController {
  constructor(private readonly service: TellerSessionService) {}

  @Get()
  @RequireAnyPermissions(TELLER, CASHIER)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('mine') mine?: string,
  ) {
    return this.service.list(user.organizationId, {
      ...(status ? { status } : {}),
      ...(date ? { date } : {}),
      ...(mine === 'true' ? { tellerId: user.userId } : {}),
    });
  }

  @Get('current')
  @RequirePermissions(TELLER)
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.service.current(user.organizationId, user.userId);
  }

  @Get(':id')
  @RequireAnyPermissions(TELLER, CASHIER)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getDetail(user.organizationId, id);
  }

  @Post('open')
  @RequirePermissions(TELLER)
  open(@CurrentUser() user: AuthenticatedUser) {
    return this.service.open(user.organizationId, user.userId);
  }

  @Post(':id/close')
  @RequirePermissions(TELLER)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.close(user.organizationId, user.userId, id);
  }

  @Post(':id/remit')
  @RequirePermissions(TELLER)
  remit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RemitDto) {
    return this.service.remit(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/receive')
  @RequirePermissions(CASHIER)
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReceiveDto,
  ) {
    return this.service.receive(user.organizationId, user.userId, id, dto.remarks);
  }
}
