import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { SupplyLedgerService } from './supply-ledger.service';

/**
 * Supplies Ledger Card — the accountant's valued inventory subsidiary ledger.
 * Lives here (with the inventory data) but is gated on accounting permissions
 * and mounted under the accounting URL space.
 */
@Controller('accounting/supply-ledger')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplyLedgerController {
  constructor(private readonly service: SupplyLedgerService) {}

  @Get('items')
  @RequirePermissions('accounting.supply_ledger.read')
  listItems(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listItems(user.organizationId);
  }

  @Get('reconciliation')
  @RequirePermissions('accounting.supply_ledger.read')
  reconciliation(@CurrentUser() user: AuthenticatedUser) {
    return this.service.reconciliation(user.organizationId);
  }

  @Get('items/:id')
  @RequirePermissions('accounting.supply_ledger.read')
  card(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.card(user.organizationId, id, from, to);
  }
}
