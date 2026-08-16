import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CreateLoanDto, CreateLoanDvDto, MarkAmortizationPaidDto } from './dto/loan.dto';
import { LoanService } from './loan.service';

@Controller('accounting/loans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoanController {
  constructor(private readonly loans: LoanService) {}

  @Get()
  @RequirePermissions('accounting.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.loans.list(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.get(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.dv.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLoanDto) {
    return this.loans.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/post')
  @RequirePermissions('accounting.dv.create')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.post(user.organizationId, user.userId, id);
  }

  @Post(':id/amortizations/:amId/dv')
  @RequirePermissions('accounting.dv.create')
  createDv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('amId', ParseUUIDPipe) amId: string,
    @Body() dto: CreateLoanDvDto,
  ) {
    return this.loans.createDvForLine(user.organizationId, user.userId, id, amId, dto.dvDate);
  }

  @Post(':id/amortizations/:amId/mark-paid')
  @RequirePermissions('accounting.dv.create')
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('amId', ParseUUIDPipe) amId: string,
    @Body() dto: MarkAmortizationPaidDto,
  ) {
    return this.loans.markPaid(user.organizationId, user.userId, id, amId, dto.paid);
  }

  @Delete(':id')
  @RequirePermissions('accounting.dv.create')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.remove(user.organizationId, id);
  }
}
