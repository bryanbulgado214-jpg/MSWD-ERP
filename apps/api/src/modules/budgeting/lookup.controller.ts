import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('budgeting/lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LookupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('responsibility-centers')
  @RequirePermissions('budgeting.read')
  async listResponsibilityCenters(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.responsibilityCenter.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  @Get('fund-sources')
  @RequirePermissions('budgeting.read')
  async listFundSources(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.fundSource.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, code: true, name: true, description: true },
      orderBy: { code: 'asc' },
    });
  }

  @Get('departments')
  @RequirePermissions('budgeting.read')
  async listDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.department.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  @Get('locations')
  @RequirePermissions('budgeting.read')
  async listLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.location.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  @Get('users')
  @RequirePermissions('budgeting.read')
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, username: true, email: true },
      orderBy: { username: 'asc' },
    });
  }

  @Get('fiscal-years')
  @RequirePermissions('budgeting.read')
  async listFiscalYears(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.fiscalYear.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, year: true, name: true, startDate: true, endDate: true },
      orderBy: { year: 'desc' },
    });
  }
}
