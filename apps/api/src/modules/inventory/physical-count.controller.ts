import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApprovePhysicalCountDto, CreatePhysicalCountDto, SubmitPhysicalCountDto } from './dto/physical-count.dto';
import { PhysicalCountService } from './physical-count.service';

@Controller('inventory/physical-counts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PhysicalCountController {
  constructor(private readonly countService: PhysicalCountService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('countType') countType?: string,
  ) {
    return this.countService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(countType ? { countType } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.countService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.physical_count.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePhysicalCountDto,
  ) {
    return this.countService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('inventory.physical_count.manage')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitPhysicalCountDto,
  ) {
    return this.countService.submit(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/complete')
  @RequirePermissions('inventory.physical_count.manage')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitPhysicalCountDto,
  ) {
    return this.countService.complete(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('inventory.physical_count.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePhysicalCountDto,
  ) {
    return this.countService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }
}
