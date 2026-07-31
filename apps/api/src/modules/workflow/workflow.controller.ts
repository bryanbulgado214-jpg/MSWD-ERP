import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { WorkflowService } from './workflow.service';

@Controller('workflow')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('instances')
  @RequirePermissions('procurement.read')
  async getInstance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('subjectTable') subjectTable: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.workflowService.getInstanceWithActions(
      user.organizationId,
      subjectTable,
      subjectId,
    );
  }
}
