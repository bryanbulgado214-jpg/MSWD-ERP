import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetVersionService } from './budget-version.service';
import { CreateBudgetVersionDto, UpdateBudgetVersionDto } from './dto/budget-version.dto';

@Controller('budgeting/budget-versions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetVersionsController {
  constructor(private readonly budgetVersionService: BudgetVersionService) {}

  @Post()
  @RequirePermissions('budgeting.version.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetVersionDto) {
    return this.budgetVersionService.create(user.organizationId, dto, user.userId);
  }

  @Get()
  @RequirePermissions('budgeting.read')
  findAllForCycle(@CurrentUser() user: AuthenticatedUser, @Query('budgetCycleId', ParseUUIDPipe) budgetCycleId: string) {
    return this.budgetVersionService.findAllForCycle(user.organizationId, budgetCycleId);
  }

  @Get(':id')
  @RequirePermissions('budgeting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetVersionService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('budgeting.version.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetVersionDto,
  ) {
    return this.budgetVersionService.update(user.organizationId, id, dto, user.userId);
  }
}
