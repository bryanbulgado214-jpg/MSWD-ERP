import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetHeaderService } from './budget-header.service';
import { CreateBudgetHeaderDto, ListBudgetHeadersQueryDto, UpdateBudgetHeaderDto } from './dto/budget-header.dto';

@Controller('budgeting/budget-headers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetHeadersController {
  constructor(private readonly budgetHeaderService: BudgetHeaderService) {}

  @Post()
  @RequirePermissions('budgeting.header.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetHeaderDto) {
    return this.budgetHeaderService.create(user.organizationId, dto, user.userId);
  }

  /** Search + filter + paginate + sort — see ListBudgetHeadersQueryDto
   * for every supported query param. `budgetVersionId` is one of the
   * optional filters here, not a required param. */
  @Get()
  @RequirePermissions('budgeting.read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListBudgetHeadersQueryDto) {
    return this.budgetHeaderService.findAllPaginated(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('budgeting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetHeaderService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('budgeting.header.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetHeaderDto,
  ) {
    return this.budgetHeaderService.update(user.organizationId, id, dto, user.userId);
  }
}
