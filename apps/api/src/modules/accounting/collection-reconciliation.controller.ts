import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CollectionReconciliationService } from './collection-reconciliation.service';

@Controller('accounting/collections/reconciliation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionReconciliationController {
  constructor(private readonly service: CollectionReconciliationService) {}

  @Get()
  @RequirePermissions('accounting.read')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.summary(user.organizationId);
  }
}
