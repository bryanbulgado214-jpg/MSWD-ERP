import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AppraiseDisposalDto, ApproveDisposalDto, CreateDisposalRequestDto } from './dto/disposal-request.dto';
import { DisposalRequestService } from './disposal-request.service';

@Controller('inventory/disposal-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DisposalRequestController {
  constructor(private readonly disposalService: DisposalRequestService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.disposalService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.disposalService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.dispose.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDisposalRequestDto,
  ) {
    return this.disposalService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit-for-appraisal')
  @RequirePermissions('inventory.dispose.manage')
  submitForAppraisal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDisposalDto,
  ) {
    return this.disposalService.submitForAppraisal(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/appraise')
  @RequirePermissions('inventory.dispose.appraise')
  appraise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AppraiseDisposalDto,
  ) {
    return this.disposalService.appraise(
      user.organizationId, id, user.userId, dto.expectedVersion, dto.disposalMethod, dto.items,
    );
  }

  @Post(':id/submit-for-approval')
  @RequirePermissions('inventory.dispose.manage')
  submitForApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDisposalDto,
  ) {
    return this.disposalService.submitForApproval(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('inventory.dispose.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDisposalDto,
  ) {
    return this.disposalService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/dispose')
  @RequirePermissions('inventory.dispose.manage')
  dispose(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDisposalDto,
  ) {
    return this.disposalService.dispose(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.dispose.manage')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDisposalDto,
  ) {
    return this.disposalService.cancel(user.organizationId, id, user.userId, dto.expectedVersion);
  }
}
