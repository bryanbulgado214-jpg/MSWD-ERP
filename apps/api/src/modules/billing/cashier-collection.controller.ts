import {
  Body,
  Controller,
  Delete,
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

import { CashierCollectionService } from './cashier-collection.service';
import {
  CreateCashierReportDto,
  RecordDepositDto,
  SubmitCashierReportDto,
  UpdateCashierReportDto,
  UpsertCashierEntryDto,
  UpsertCollectionAreaDto,
  UpsertCollectorDto,
} from './dto/cashier-collection.dto';

@Controller('billing/cashier-collection')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashierCollectionController {
  constructor(private readonly service: CashierCollectionService) {}

  // ── Admin: collector list ──

  @Get('collectors')
  @RequirePermissions('collections.setup.manage')
  listCollectors(@CurrentUser() u: AuthenticatedUser, @Query('activeOnly') activeOnly?: string) {
    return this.service.listCollectors(u.organizationId, activeOnly === 'true');
  }

  @Post('collectors')
  @RequirePermissions('collections.setup.manage')
  createCollector(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpsertCollectorDto) {
    return this.service.createCollector(u.organizationId, dto);
  }

  @Patch('collectors/:id')
  @RequirePermissions('collections.setup.manage')
  updateCollector(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCollectorDto,
  ) {
    return this.service.updateCollector(u.organizationId, id, dto);
  }

  @Delete('collectors/:id')
  @RequirePermissions('collections.setup.manage')
  deleteCollector(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCollector(u.organizationId, id);
  }

  // ── Admin: collection-area list ──

  @Get('areas')
  @RequirePermissions('collections.setup.manage')
  listAreas(@CurrentUser() u: AuthenticatedUser, @Query('activeOnly') activeOnly?: string) {
    return this.service.listAreas(u.organizationId, activeOnly === 'true');
  }

  @Post('areas')
  @RequirePermissions('collections.setup.manage')
  createArea(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpsertCollectionAreaDto) {
    return this.service.createArea(u.organizationId, dto);
  }

  @Patch('areas/:id')
  @RequirePermissions('collections.setup.manage')
  updateArea(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCollectionAreaDto,
  ) {
    return this.service.updateArea(u.organizationId, id, dto);
  }

  @Delete('areas/:id')
  @RequirePermissions('collections.setup.manage')
  deleteArea(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteArea(u.organizationId, id);
  }

  // ── Cashier: daily collection report ──

  @Get('form-options')
  @RequirePermissions('collections.cashier.report')
  formOptions(@CurrentUser() u: AuthenticatedUser) {
    return this.service.getFormOptions(u.organizationId);
  }

  @Get('dashboard-counts')
  @RequirePermissions('collections.cashier.report')
  dashboardCounts(@CurrentUser() u: AuthenticatedUser) {
    return this.service.getDashboardCounts(u.organizationId);
  }

  @Get('bank-accounts')
  @RequirePermissions('collections.cashier.report')
  bankAccounts(@CurrentUser() u: AuthenticatedUser) {
    return this.service.listBankAccounts(u.organizationId);
  }

  @Post('reports/:id/deposit')
  @RequirePermissions('collections.cashier.report')
  recordDeposit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDepositDto,
  ) {
    return this.service.recordDeposit(u.organizationId, id, u.userId, dto);
  }

  @Get('reports')
  @RequirePermissions('collections.cashier.report')
  listReports(@CurrentUser() u: AuthenticatedUser) {
    return this.service.listReports(u.organizationId);
  }

  @Post('reports')
  @RequirePermissions('collections.cashier.report')
  createReport(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateCashierReportDto) {
    return this.service.createReport(u.organizationId, u.userId, dto);
  }

  @Get('reports/:id')
  @RequirePermissions('collections.cashier.report')
  getReport(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getReport(u.organizationId, id);
  }

  @Patch('reports/:id')
  @RequirePermissions('collections.cashier.report')
  updateReport(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashierReportDto,
  ) {
    return this.service.updateReport(u.organizationId, id, u.userId, dto);
  }

  @Delete('reports/:id')
  @RequirePermissions('collections.cashier.report')
  deleteReport(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteReport(u.organizationId, id, u.userId);
  }

  @Post('reports/:id/entries')
  @RequirePermissions('collections.cashier.report')
  addEntry(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCashierEntryDto,
  ) {
    return this.service.addEntry(u.organizationId, id, u.userId, dto);
  }

  @Patch('reports/:id/entries/:entryId')
  @RequirePermissions('collections.cashier.report')
  updateEntry(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpsertCashierEntryDto,
  ) {
    return this.service.updateEntry(u.organizationId, id, entryId, u.userId, dto);
  }

  @Delete('reports/:id/entries/:entryId')
  @RequirePermissions('collections.cashier.report')
  deleteEntry(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.service.deleteEntry(u.organizationId, id, entryId, u.userId);
  }

  @Post('reports/:id/submit')
  @RequirePermissions('collections.cashier.report')
  submitReport(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitCashierReportDto,
  ) {
    return this.service.submitReport(u.organizationId, id, u.userId, dto);
  }
}
