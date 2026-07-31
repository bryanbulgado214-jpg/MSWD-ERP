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

  @Get('users')
  @RequirePermissions('procurement.read')
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, username: true, email: true },
      orderBy: { username: 'asc' },
    });
  }

  @Get('permissions')
  @RequirePermissions('procurement.read')
  async listPermissions() {
    return this.prisma.permission.findMany({
      where: { code: { startsWith: 'procurement.' } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  @Get('departments')
  @RequirePermissions('procurement.read')
  async listDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.department.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
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
