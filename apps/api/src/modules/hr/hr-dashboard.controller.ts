import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { HrDashboardService } from './hr-dashboard.service';

@Controller('hr/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HrDashboardController {
  constructor(private readonly dashboardService: HrDashboardService) {}

  @Get()
  @RequirePermissions('hr.read')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDashboard(user.organizationId);
  }
}
