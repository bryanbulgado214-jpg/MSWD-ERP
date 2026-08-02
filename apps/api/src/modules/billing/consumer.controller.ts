import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ConsumerService } from './consumer.service';
import { AssignMeterDto, CreateConsumerDto, UpdateConsumerDto } from './dto/consumer.dto';

@Controller('billing/consumers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConsumerController {
  constructor(private readonly consumerService: ConsumerService) {}

  @Get()
  @RequirePermissions('billing.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('consumerType') consumerType?: string,
    @Query('barangay') barangay?: string,
    @Query('search') search?: string,
  ) {
    return this.consumerService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(consumerType ? { consumerType } : {}),
      ...(barangay ? { barangay } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get('barangays')
  @RequirePermissions('billing.read')
  getBarangays(@CurrentUser() user: AuthenticatedUser) {
    return this.consumerService.getBarangays(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('billing.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.consumerService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('billing.consumer.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConsumerDto) {
    return this.consumerService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('billing.consumer.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateConsumerDto) {
    return this.consumerService.update(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/assign-meter')
  @RequirePermissions('billing.meter.manage')
  assignMeter(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignMeterDto) {
    return this.consumerService.assignMeter(user.organizationId, user.userId, id, dto);
  }
}
