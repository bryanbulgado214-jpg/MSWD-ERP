import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CreatePayeeDto, MergePayeeDto, UpdatePayeeDto } from './dto/payee.dto';
import { PayeeService } from './payee.service';

@Controller('accounting/payees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayeeController {
  constructor(private readonly payees: PayeeService) {}

  @Get()
  @RequirePermissions('accounting.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.payees.list(user.organizationId, {
      ...(search ? { search } : {}),
      includeInactive: includeInactive === 'true',
    });
  }

  @Post()
  @RequirePermissions('accounting.dv.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayeeDto) {
    return this.payees.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('accounting.dv.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayeeDto,
  ) {
    return this.payees.update(user.organizationId, user.userId, id, dto);
  }

  @Post(':id/merge')
  @RequirePermissions('accounting.dv.create')
  merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergePayeeDto,
  ) {
    return this.payees.merge(user.organizationId, user.userId, id, dto.targetId);
  }
}
