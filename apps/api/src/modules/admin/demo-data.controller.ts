import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { DemoDataService } from './demo-data.service';

@Controller('admin/demo-data')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DemoDataController {
  constructor(private readonly demo: DemoDataService) {}

  @Get('status')
  @RequirePermissions('core.user.manage')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.demo.status(user.organizationId);
  }

  @Post('generate')
  @RequirePermissions('core.user.manage')
  generate(@CurrentUser() user: AuthenticatedUser) {
    return this.demo.generate(user.organizationId, user.userId);
  }

  @Post('wipe')
  @RequirePermissions('core.user.manage')
  wipe(@CurrentUser() user: AuthenticatedUser) {
    return this.demo.wipe(user.organizationId);
  }
}
