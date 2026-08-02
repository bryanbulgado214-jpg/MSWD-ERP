import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PositionService } from './position.service';
import { CreatePositionDto, UpdatePositionDto } from './dto/employee.dto';

@Controller('hr/positions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  @RequirePermissions('hr.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.positionService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('hr.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.positionService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('hr.employee.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePositionDto) {
    return this.positionService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions('hr.employee.manage')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdatePositionDto) {
    return this.positionService.update(user.organizationId, id, dto);
  }
}
