import { Module } from '@nestjs/common';

import { BudgetCalculationController } from './budget-calculation.controller';
import { BudgetCalculationService } from './budget-calculation.service';
import { BudgetCycleService } from './budget-cycle.service';
import { BudgetCyclesController } from './budget-cycles.controller';
import { BudgetHeaderService } from './budget-header.service';
import { BudgetHeadersController } from './budget-headers.controller';
import { BudgetLineService } from './budget-line.service';
import { BudgetLinesController } from './budget-lines.controller';
import { BudgetReleaseService } from './budget-release.service';
import { BudgetReleasesController } from './budget-releases.controller';
import { BudgetVersionService } from './budget-version.service';
import { BudgetVersionsController } from './budget-versions.controller';
import { LookupController } from './lookup.controller';
import { ReservationService } from './reservation.service';
import { ReservationsController } from './reservations.controller';

/**
 * Budgeting module — full REST API surface over the Budgeting schema:
 * CRUD for budget cycles/versions/headers/lines, release creation,
 * the full reservation lifecycle, and read-only calculation summaries.
 * Every controller is guarded by JwtAuthGuard (authentication) +
 * PermissionsGuard (authorization) — see AuthModule for how a token is
 * obtained and common/guards/permissions.guard.ts for how permissions
 * are checked.
 */
@Module({
  controllers: [
    BudgetCyclesController,
    BudgetVersionsController,
    BudgetHeadersController,
    BudgetLinesController,
    BudgetReleasesController,
    ReservationsController,
    BudgetCalculationController,
    LookupController,
  ],
  providers: [
    BudgetCycleService,
    BudgetVersionService,
    BudgetHeaderService,
    BudgetLineService,
    BudgetReleaseService,
    ReservationService,
    BudgetCalculationService,
  ],
  exports: [BudgetCalculationService, BudgetReleaseService, ReservationService],
})
export class BudgetingModule {}
