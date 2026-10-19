import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CustomerConcernService } from './customer-concern.service';
import {
  CreateCustomerConcernDto,
  UpdateCustomerConcernDto,
} from './dto/customer-concern.dto';

// Customer Complaint/Concern Forms (CCF) live under the Work Order module and
// are gated by the work-order permissions.
@Controller('ccf')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerConcernController {
  constructor(private readonly service: CustomerConcernService) {}

  // The register (CFRR) and the CCF list share this endpoint — rows carry the
  // aging indicators (daysOpen / isOpen / overdue).
  @Get()
  @RequirePermissions('workorder.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get('lookup')
  @RequirePermissions('workorder.read')
  lookup(@CurrentUser() user: AuthenticatedUser) {
    return this.service.lookup(user.organizationId);
  }

  // Suggested next Series No. for the New-CCF form (editable on the client).
  @Get('next-reference')
  @RequirePermissions('workorder.read')
  async nextReference(@CurrentUser() user: AuthenticatedUser) {
    return { referenceNumber: await this.service.suggestReference(user.organizationId) };
  }

  @Get(':id')
  @RequirePermissions('workorder.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('workorder.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerConcernDto) {
    return this.service.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('workorder.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerConcernDto,
  ) {
    return this.service.update(user.organizationId, id, user.userId, dto);
  }

  @Delete(':id')
  @RequirePermissions('workorder.create')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}
