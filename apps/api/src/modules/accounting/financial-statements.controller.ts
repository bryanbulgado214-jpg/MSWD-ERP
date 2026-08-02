import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { FinancialStatementsService } from './financial-statements.service';

@Controller('accounting/financial-statements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialStatementsController {
  constructor(private readonly fsService: FinancialStatementsService) {}

  @Get()
  @RequirePermissions('accounting.read')
  getFinancialStatements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodId') periodId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.fsService.getFinancialStatements(user.organizationId, {
      ...(periodId ? { periodId } : {}),
      ...(fiscalYearId ? { fiscalYearId } : {}),
    });
  }
}
