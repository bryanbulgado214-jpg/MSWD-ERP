import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetCycleService } from './budget-cycle.service';
import { CreateBudgetCycleDto, UpdateBudgetCycleDto } from './dto/budget-cycle.dto';

@Controller('budgeting/budget-cycles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetCyclesController {
  constructor(private readonly budgetCycleService: BudgetCycleService) {}

  @Post()
  @RequirePermissions('budgeting.cycle.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetCycleDto) {
    return this.budgetCycleService.create(user.organizationId, dto, user.userId);
  }

  @Get()
  @RequirePermissions('budgeting.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.budgetCycleService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('budgeting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetCycleService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('budgeting.cycle.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetCycleDto,
  ) {
    return this.budgetCycleService.update(user.organizationId, id, dto, user.userId);
  }
}
