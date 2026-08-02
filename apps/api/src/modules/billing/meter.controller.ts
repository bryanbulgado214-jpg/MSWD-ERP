import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateMeterDto, UpdateMeterDto } from './dto/meter.dto';
import { MeterService } from './meter.service';

@Controller('billing/meters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeterController {
  constructor(private readonly meterService: MeterService) {}

  @Get()
  @RequirePermissions('billing.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.meterService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get('unassigned')
  @RequirePermissions('billing.read')
  getUnassigned(@CurrentUser() user: AuthenticatedUser) {
    return this.meterService.getUnassigned(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.meterService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.meter.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeterDto) {
    return this.meterService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('billing.meter.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMeterDto) {
    return this.meterService.update(user.organizationId, user.userId, id, dto);
  }
}
