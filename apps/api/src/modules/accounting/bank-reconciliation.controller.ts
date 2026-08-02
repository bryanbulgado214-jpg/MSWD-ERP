import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BankReconciliationService } from './bank-reconciliation.service';
import { AddReconItemDto, CreateBankReconciliationDto, ReconActionDto, RemoveReconItemDto } from './dto/bank-reconciliation.dto';

@Controller('accounting/reconciliations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankReconciliationController {
  constructor(private readonly reconService: BankReconciliationService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: string,
  ) {
    return this.reconService.findAll(user.organizationId, {
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.bank.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBankReconciliationDto,
  ) {
    return this.reconService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/items')
  @RequirePermissions('accounting.bank.manage')
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddReconItemDto,
  ) {
    return this.reconService.addItem(user.organizationId, id, user.userId, dto);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('accounting.bank.manage')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: RemoveReconItemDto,
  ) {
    return this.reconService.removeItem(user.organizationId, id, itemId, user.userId, dto.expectedVersion);
  }

  @Post(':id/complete')
  @RequirePermissions('accounting.bank.manage')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconActionDto,
  ) {
    return this.reconService.complete(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('accounting.bank.manage')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconActionDto,
  ) {
    return this.reconService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }
}
