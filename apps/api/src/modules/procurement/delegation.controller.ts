import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { DelegationService } from './delegation.service';
import { CreateDelegationDto, RevokeDelegationDto } from './dto/delegation.dto';

@Controller('procurement/delegations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DelegationController {
  constructor(private readonly delegationService: DelegationService) {}

  @Get()
  @RequirePermissions('procurement.read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('delegatorUserId') delegatorUserId?: string,
    @Query('delegateUserId') delegateUserId?: string,
    @Query('status') status?: string,
  ) {
    return this.delegationService.findAll(user.organizationId, {
      ...(delegatorUserId ? { delegatorUserId } : {}),
      ...(delegateUserId ? { delegateUserId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.delegationService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.delegation.manage')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDelegationDto,
  ) {
    return this.delegationService.create(user.organizationId, user.userId, {
      delegateUserId: dto.delegateUserId,
      permissionCode: dto.permissionCode,
      effectiveDate: dto.effectiveDate,
      expirationDate: dto.expirationDate,
      ...(dto.amountLimit !== undefined ? { amountLimit: dto.amountLimit } : {}),
      ...(dto.scopeDepartmentId ? { scopeDepartmentId: dto.scopeDepartmentId } : {}),
      ...(dto.remarks ? { remarks: dto.remarks } : {}),
    });
  }

  @Patch(':id/revoke')
  @RequirePermissions('procurement.delegation.manage')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeDelegationDto,
  ) {
    return this.delegationService.revoke(user.organizationId, user.userId, id, {
      expectedVersion: dto.expectedVersion,
      ...(dto.remarks ? { remarks: dto.remarks } : {}),
    });
  }
}
