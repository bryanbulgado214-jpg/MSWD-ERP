import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CafActionDto, CreateCafDto } from './dto/caf.dto';
import { CafService } from './caf.service';

@Controller('procurement/cafs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CafController {
  constructor(private readonly cafService: CafService) {}

  @Get()
  @RequirePermissions('procurement.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('purchaseRequestId') purchaseRequestId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
  ) {
    return this.cafService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(purchaseRequestId ? { purchaseRequestId } : {}),
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cafService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.caf.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCafDto,
  ) {
    return this.cafService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.caf.create')
  submitForCertification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CafActionDto,
  ) {
    return this.cafService.submitForCertification(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/certify')
  @RequirePermissions('procurement.caf.certify')
  certify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CafActionDto,
  ) {
    return this.cafService.certify(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/reject')
  @RequirePermissions('procurement.caf.certify')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CafActionDto,
  ) {
    return this.cafService.reject(user.organizationId, id, user.userId, dto.expectedVersion, dto.remarks);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.caf.cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CafActionDto,
  ) {
    return this.cafService.cancel(user.organizationId, id, user.userId, dto.expectedVersion, dto.remarks);
  }
}
