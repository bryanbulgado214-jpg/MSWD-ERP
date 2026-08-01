import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateAccountabilityRecordDto, ReturnAccountabilityDto, TransferAccountabilityDto } from './dto/accountability-record.dto';
import { AccountabilityRecordService } from './accountability-record.service';

@Controller('inventory/accountability-records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountabilityRecordController {
  constructor(private readonly accountabilityService: AccountabilityRecordService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('issuedToUserId') issuedToUserId?: string,
  ) {
    return this.accountabilityService.findAll(user.organizationId, {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(issuedToUserId ? { issuedToUserId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accountabilityService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('inventory.accountability.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountabilityRecordDto,
  ) {
    return this.accountabilityService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/return')
  @RequirePermissions('inventory.accountability.manage')
  returnItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnAccountabilityDto,
  ) {
    return this.accountabilityService.returnItems(
      user.organizationId, id, user.userId, dto.expectedVersion, dto.returnDate,
    );
  }

  @Post(':id/transfer')
  @RequirePermissions('inventory.accountability.manage')
  transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferAccountabilityDto,
  ) {
    return this.accountabilityService.transfer(
      user.organizationId, id, user.userId, dto.expectedVersion, dto.newUserId,
    );
  }
}
