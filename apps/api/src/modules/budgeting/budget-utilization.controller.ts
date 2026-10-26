import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetUtilizationService } from './budget-utilization.service';
import {
  CreateBudgetUtilizationLineDto,
  SeedUtilizationLinesDto,
  SetUtilizationAccountsDto,
  UpdateBudgetUtilizationLineDto,
} from './dto/budget-utilization.dto';

@Controller('budgeting/utilization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetUtilizationController {
  constructor(private readonly service: BudgetUtilizationService) {}

  // ── Configuration (budget officer) ──

  @Get('lines')
  @RequirePermissions('budgeting.read')
  listLines(@CurrentUser() user: AuthenticatedUser, @Query('fiscalYearId', ParseUUIDPipe) fiscalYearId: string) {
    return this.service.listLines(user.organizationId, fiscalYearId);
  }

  @Post('lines')
  @RequirePermissions('budgeting.header.manage')
  createLine(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetUtilizationLineDto) {
    return this.service.createLine(user.organizationId, user.userId, dto);
  }

  @Patch('lines/:id')
  @RequirePermissions('budgeting.header.manage')
  updateLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetUtilizationLineDto,
  ) {
    return this.service.updateLine(user.organizationId, user.userId, id, dto);
  }

  @Delete('lines/:id')
  @RequirePermissions('budgeting.header.manage')
  deleteLine(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteLine(user.organizationId, id);
  }

  @Put('lines/:id/accounts')
  @RequirePermissions('budgeting.header.manage')
  setAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUtilizationAccountsDto,
  ) {
    return this.service.setAccounts(user.organizationId, id, dto.accountIds);
  }

  // The "ignore entries offset by these accounts" rule for a line (e.g. the
  // Supplies line ignoring the month-end entries that credit Supplies Inventory).
  @Put('lines/:id/excluded-contras')
  @RequirePermissions('budgeting.header.manage')
  setExcludedContras(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUtilizationAccountsDto,
  ) {
    return this.service.setExcludedContras(user.organizationId, id, dto.accountIds);
  }

  @Post('seed')
  @RequirePermissions('budgeting.header.manage')
  seed(@CurrentUser() user: AuthenticatedUser, @Body() dto: SeedUtilizationLinesDto) {
    return this.service.seedDefaults(user.organizationId, user.userId, dto.fiscalYearId);
  }

  // ── The report + drill-down ──

  @Get('report')
  @RequirePermissions('budgeting.read')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId', ParseUUIDPipe) fiscalYearId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.report(user.organizationId, fiscalYearId, startDate, endDate);
  }

  @Get('lines/:id/breakdown')
  @RequirePermissions('budgeting.read')
  breakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.lineBreakdown(user.organizationId, id, startDate, endDate);
  }
}
