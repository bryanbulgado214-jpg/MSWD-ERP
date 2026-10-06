import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePersonnelDto, CreateTeamDto, UpdatePersonnelDto, UpdateTeamDto } from './dto/work-order-crew.dto';
import { WorkOrderCrewService } from './work-order-crew.service';

// Field-personnel roster and reusable teams for the work-order dispatch flow.
// Full paths (no controller base) so they don't collide with /workorders/:id.
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrderCrewController {
  constructor(private readonly crew: WorkOrderCrewService) {}

  // ── Personnel ──
  @Get('workorder-personnel')
  @RequirePermissions('workorder.read')
  listPersonnel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('section') section?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.crew.listPersonnel(user.organizationId, {
      ...(section ? { section } : {}),
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('workorder-personnel')
  @RequirePermissions('workorder.team.manage')
  createPersonnel(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePersonnelDto) {
    return this.crew.createPersonnel(user.organizationId, user.userId, dto);
  }

  @Patch('workorder-personnel/:id')
  @RequirePermissions('workorder.team.manage')
  updatePersonnel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonnelDto,
  ) {
    return this.crew.updatePersonnel(user.organizationId, id, user.userId, dto);
  }

  // ── Teams ──
  @Get('workorder-teams')
  @RequirePermissions('workorder.read')
  listTeams(
    @CurrentUser() user: AuthenticatedUser,
    @Query('section') section?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.crew.listTeams(user.organizationId, {
      ...(section ? { section } : {}),
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('workorder-teams')
  @RequirePermissions('workorder.team.manage')
  createTeam(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTeamDto) {
    return this.crew.createTeam(user.organizationId, user.userId, dto);
  }

  @Patch('workorder-teams/:id')
  @RequirePermissions('workorder.team.manage')
  updateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.crew.updateTeam(user.organizationId, id, user.userId, dto);
  }
}
