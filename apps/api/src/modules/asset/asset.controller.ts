import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { AssetService } from './asset.service';
import {
  ApproveAssetTransferDto,
  AssignCategoryDto,
  CompleteAssetTransferDto,
  CreateAssetCategoryDto,
  CreateAssetTransferDto,
  CreateDepreciationRunDto,
  PostDepreciationRunDto,
  RejectAssetTransferDto,
  UpdateAssetCategoryDto,
  VoidDepreciationRunDto,
} from './dto/asset.dto';

@Controller('asset')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  /* ── Categories ── */

  @Get('categories')
  @RequirePermissions('asset.read')
  findAllCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.assetService.findAllCategories(user.organizationId);
  }

  @Get('categories/:id')
  @RequirePermissions('asset.read')
  findCategoryById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.assetService.findCategoryById(user.organizationId, id);
  }

  @Post('categories')
  @RequirePermissions('asset.category.manage')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssetCategoryDto) {
    return this.assetService.createCategory(user.organizationId, user.userId, dto);
  }

  @Put('categories/:id')
  @RequirePermissions('asset.category.manage')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssetCategoryDto,
  ) {
    return this.assetService.updateCategory(user.organizationId, id, dto);
  }

  @Post('property-records/:id/assign-category')
  @RequirePermissions('asset.category.manage')
  assignCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignCategoryDto,
  ) {
    return this.assetService.assignCategory(user.organizationId, id, dto);
  }

  /* ── Depreciation Runs ── */

  @Get('depreciation-runs')
  @RequirePermissions('asset.read')
  findAllRuns(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.assetService.findAllRuns(user.organizationId, status);
  }

  @Get('depreciation-runs/:id')
  @RequirePermissions('asset.read')
  findRunById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.assetService.findRunById(user.organizationId, id);
  }

  @Post('depreciation-runs')
  @RequirePermissions('asset.depreciation.run')
  createRun(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepreciationRunDto) {
    return this.assetService.createRun(user.organizationId, user.userId, dto);
  }

  @Post('depreciation-runs/:id/post')
  @RequirePermissions('asset.depreciation.post')
  postRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PostDepreciationRunDto,
  ) {
    return this.assetService.postRun(user.organizationId, user.userId, id, dto.version);
  }

  @Post('depreciation-runs/:id/void')
  @RequirePermissions('asset.depreciation.post')
  voidRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VoidDepreciationRunDto,
  ) {
    return this.assetService.voidRun(user.organizationId, user.userId, id, dto.version);
  }

  /* ── Transfers ── */

  @Get('transfers')
  @RequirePermissions('asset.read')
  findAllTransfers(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.assetService.findAllTransfers(user.organizationId, status);
  }

  @Get('transfers/:id')
  @RequirePermissions('asset.read')
  findTransferById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.assetService.findTransferById(user.organizationId, id);
  }

  @Post('transfers')
  @RequirePermissions('asset.transfer.create')
  createTransfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssetTransferDto) {
    return this.assetService.createTransfer(user.organizationId, user.userId, dto);
  }

  @Post('transfers/:id/approve')
  @RequirePermissions('asset.transfer.approve')
  approveTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveAssetTransferDto,
  ) {
    return this.assetService.approveTransfer(user.organizationId, user.userId, id, dto.version);
  }

  @Post('transfers/:id/reject')
  @RequirePermissions('asset.transfer.approve')
  rejectTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectAssetTransferDto,
  ) {
    return this.assetService.rejectTransfer(
      user.organizationId,
      user.userId,
      id,
      dto.version,
      dto.reason,
    );
  }

  @Post('transfers/:id/complete')
  @RequirePermissions('asset.transfer.approve')
  completeTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteAssetTransferDto,
  ) {
    return this.assetService.completeTransfer(user.organizationId, user.userId, id, dto.version);
  }

  /* ── Reports ── */

  @Get('register')
  @RequirePermissions('asset.read')
  getAssetRegister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
    @Query('isDisposed') isDisposed?: string,
  ) {
    return this.assetService.getAssetRegister(user.organizationId, categoryId, isDisposed);
  }

  @Get('dashboard')
  @RequirePermissions('asset.read')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.assetService.getDashboard(user.organizationId);
  }

  @Get('reports/depreciation-schedule')
  @RequirePermissions('asset.reports')
  getDepreciationSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.assetService.getDepreciationSchedule(user.organizationId, categoryId);
  }

  /** Report-scoped fixed-asset register (accountant holds asset.reports, not asset.read). */
  @Get('reports/register')
  @RequirePermissions('asset.reports')
  getRegisterReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.assetService.getAssetRegister(user.organizationId, categoryId);
  }
}
