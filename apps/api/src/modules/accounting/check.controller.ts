import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CheckService } from './check.service';
import { CreateCheckDto, TransitionCheckDto } from './dto/check.dto';

@Controller('accounting/checks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CheckController {
  constructor(private readonly checkService: CheckService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.checkService.findAll(user.organizationId, {
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.checkService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.bank.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckDto,
  ) {
    return this.checkService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/transition')
  @RequirePermissions('accounting.bank.manage')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCheckDto,
  ) {
    return this.checkService.transition(user.organizationId, id, user.userId, dto);
  }
}
