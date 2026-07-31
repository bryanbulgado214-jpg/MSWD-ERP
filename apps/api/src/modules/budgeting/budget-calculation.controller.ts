import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { BudgetCalculationService } from './budget-calculation.service';

@Controller('budgeting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BudgetCalculationController {
  constructor(private readonly budgetCalculationService: BudgetCalculationService) {}

  @Get('budget-releases/:id/summary')
  @RequirePermissions('budgeting.read')
  getReleaseSummary(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetCalculationService.getReleaseSummary(user.organizationId, id);
  }

  @Get('budget-headers/:id/summary')
  @RequirePermissions('budgeting.read')
  getHeaderSummary(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetCalculationService.getHeaderSummary(user.organizationId, id);
  }
}
