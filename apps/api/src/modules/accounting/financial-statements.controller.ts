import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { DetailedStatementsService } from './detailed-statements.service';
import { FinancialStatementsService } from './financial-statements.service';

@Controller('accounting/financial-statements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialStatementsController {
  constructor(
    private readonly fsService: FinancialStatementsService,
    private readonly detailed: DetailedStatementsService,
  ) {}

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

  /** Detailed/Condensed COA Statement of Financial Position (interim or year-end). */
  @Get('sfp')
  @RequirePermissions('accounting.read')
  getSfp(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodId') periodId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('mode') mode?: string,
    @Query('condensed') condensed?: string,
  ) {
    return this.detailed.getStatement(
      user.organizationId,
      'sfp',
      this.opts(periodId, fiscalYearId, mode, condensed),
    );
  }

  /** Detailed/Condensed COA Statement of Comprehensive Income (interim or year-end). */
  @Get('sci')
  @RequirePermissions('accounting.read')
  getSci(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodId') periodId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('mode') mode?: string,
    @Query('condensed') condensed?: string,
  ) {
    return this.detailed.getStatement(
      user.organizationId,
      'sci',
      this.opts(periodId, fiscalYearId, mode, condensed),
    );
  }

  /** Direct-method Statement of Cash Flows (interim or year-end). */
  @Get('scf')
  @RequirePermissions('accounting.read')
  getScf(
    @CurrentUser() user: AuthenticatedUser,
    @Query('periodId') periodId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('mode') mode?: string,
    @Query('condensed') condensed?: string,
  ) {
    return this.detailed.getCashFlows(
      user.organizationId,
      this.opts(periodId, fiscalYearId, mode, condensed),
    );
  }

  /** Year-end Statement of Changes in Equity. */
  @Get('sce')
  @RequirePermissions('accounting.read')
  getSce(@CurrentUser() user: AuthenticatedUser, @Query('fiscalYearId') fiscalYearId?: string) {
    return this.detailed.getChangesInEquity(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
    });
  }

  private opts(periodId?: string, fiscalYearId?: string, mode?: string, condensed?: string) {
    return {
      ...(periodId ? { periodId } : {}),
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(mode === 'annual' ? { mode: 'annual' as const } : {}),
      ...(condensed === '1' || condensed === 'true' ? { condensed: true } : {}),
    };
  }
}
