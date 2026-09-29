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

import { CreateEndUserDto, UpdateEndUserDto } from './dto/end-user.dto';
import { EndUserService } from './end-user.service';

@Controller('procurement/end-users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EndUserController {
  constructor(private readonly endUserService: EndUserService) {}

  // Read is open to procurement.read so the PR form can pick a requesting
  // end-user; only the budget officer (ppmp.manage) can add/edit the list.
  @Get()
  @RequirePermissions('procurement.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('departmentId') departmentId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.endUserService.findAll(user.organizationId, {
      ...(departmentId ? { departmentId } : {}),
      ...(includeInactive === 'true' ? { includeInactive: true } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.endUserService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('procurement.ppmp.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEndUserDto) {
    return this.endUserService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('procurement.ppmp.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEndUserDto,
  ) {
    return this.endUserService.update(user.organizationId, id, user.userId, dto);
  }
}
