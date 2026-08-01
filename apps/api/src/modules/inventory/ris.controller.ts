import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApproveRisDto, CreateRisDto, IssueRisDto } from './dto/ris.dto';
import { RisService } from './ris.service';

@Controller('inventory/ris')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RisController {
  constructor(private readonly risService: RisService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.risService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.risService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.ris.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRisDto,
  ) {
    return this.risService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('inventory.ris.manage')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRisDto,
  ) {
    return this.risService.submit(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('inventory.ris.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRisDto,
  ) {
    return this.risService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/issue')
  @RequirePermissions('inventory.ris.issue')
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueRisDto,
  ) {
    return this.risService.issue(user.organizationId, id, user.userId, dto.expectedVersion, dto.items);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.ris.manage')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRisDto,
  ) {
    return this.risService.cancel(user.organizationId, id, user.userId, dto.expectedVersion);
  }
}
