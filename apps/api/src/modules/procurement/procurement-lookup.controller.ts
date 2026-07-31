import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { BudgetReleaseStatus } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('procurement/lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProcurementLookupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('fiscal-years')
  @RequirePermissions('procurement.read')
  async listFiscalYears(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.fiscalYear.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, year: true, name: true, startDate: true, endDate: true },
      orderBy: { year: 'desc' },
    });
  }

  @Get('budget-releases')
  @RequirePermissions('procurement.read')
  async listBudgetReleases(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.prisma.budgetRelease.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status: status as BudgetReleaseStatus } : {}),
      },
      select: {
        id: true,
        releaseNumber: true,
        releasedAmount: true,
        availableAmount: true,
        status: true,
        budgetHeader: {
          select: {
            id: true,
            responsibilityCenter: { select: { code: true, name: true } },
            fundSource: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { releaseDate: 'desc' },
    });
  }
}
