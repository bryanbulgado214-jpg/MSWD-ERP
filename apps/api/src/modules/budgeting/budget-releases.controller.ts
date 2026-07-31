import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetReleaseService } from './budget-release.service';
import { CreateReleaseDto } from './dto/release.dto';

@Controller('budgeting/budget-releases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetReleasesController {
  constructor(private readonly budgetReleaseService: BudgetReleaseService) {}

  @Post()
  @RequirePermissions('budgeting.release.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReleaseDto) {
    return this.budgetReleaseService.release(user.organizationId, {
      budgetHeaderId: dto.budgetHeaderId,
      releaseNumber: dto.releaseNumber,
      releaseDate: new Date(dto.releaseDate),
      releasedAmount: dto.releasedAmount,
      createdBy: user.userId,
    });
  }

  @Get()
  @RequirePermissions('budgeting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('budgetHeaderId') budgetHeaderId?: string,
    @Query('status') status?: string,
  ) {
    if (budgetHeaderId) {
      return this.budgetReleaseService.findAllForHeader(user.organizationId, budgetHeaderId);
    }
    return this.budgetReleaseService.findAllForOrg(user.organizationId, status);
  }

  @Get(':id')
  @RequirePermissions('budgeting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetReleaseService.findOne(user.organizationId, id);
  }
}
