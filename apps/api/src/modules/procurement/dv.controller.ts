import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateDvDto, DvActionDto } from './dto/dv.dto';
import { DvService } from './dv.service';

@Controller('procurement/dvs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DvController {
  constructor(private readonly dvService: DvService) {}

  @Get()
  @RequirePermissions('procurement.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.dvService.list(user.organizationId, {
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dvService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.dv.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDvDto,
  ) {
    return this.dvService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit-for-certification')
  @RequirePermissions('procurement.dv.create')
  submitForCertification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DvActionDto,
  ) {
    return this.dvService.submitForCertification(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/certify')
  @RequirePermissions('procurement.dv.certify')
  certify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DvActionDto,
  ) {
    return this.dvService.certify(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/submit-for-approval')
  @RequirePermissions('procurement.dv.certify')
  submitForApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DvActionDto,
  ) {
    return this.dvService.submitForApproval(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.dv.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DvActionDto,
  ) {
    return this.dvService.approve(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/release')
  @RequirePermissions('procurement.dv.release')
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DvActionDto,
  ) {
    return this.dvService.release(user.organizationId, id, dto.expectedVersion, user.userId, {
      ...(dto.checkNumber ? { checkNumber: dto.checkNumber } : {}),
      ...(dto.checkDate ? { checkDate: dto.checkDate } : {}),
      ...(dto.bankName ? { bankName: dto.bankName } : {}),
      ...(dto.remarks ? { remarks: dto.remarks } : {}),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.dv.create')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DvActionDto,
  ) {
    return this.dvService.cancel(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }
}
