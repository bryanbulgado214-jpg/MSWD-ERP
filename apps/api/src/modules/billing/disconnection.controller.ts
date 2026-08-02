import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { DisconnectionService } from './disconnection.service';
import { CreateDisconnectionOrderDto, TransitionDisconnectionDto } from './dto/disconnection.dto';

@Controller('billing/disconnections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DisconnectionController {
  constructor(private readonly disconnectionService: DisconnectionService) {}

  @Get()
  @RequirePermissions('billing.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.disconnectionService.findAll(user.organizationId, status);
  }

  @Get('arrears')
  @RequirePermissions('billing.disconnect.manage')
  arrears(@CurrentUser() user: AuthenticatedUser) {
    return this.disconnectionService.getConsumersInArrears(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.disconnectionService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.disconnect.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDisconnectionOrderDto) {
    return this.disconnectionService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/transition')
  @RequirePermissions('billing.disconnect.manage')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionDisconnectionDto,
  ) {
    return this.disconnectionService.transition(user.organizationId, user.userId, id, dto);
  }

  @Post('apply-penalties')
  @RequirePermissions('billing.disconnect.manage')
  applyPenalties(@CurrentUser() user: AuthenticatedUser) {
    return this.disconnectionService.applyPenalties(user.organizationId, user.userId);
  }
}
