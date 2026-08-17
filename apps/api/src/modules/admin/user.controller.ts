import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { AssignRoleDto, CreateUserDto, SetUserPermissionsDto, UpdateUserDto } from './dto/user.dto';
import { UserService } from './user.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions('core.user.manage')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.userService.list(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('core.user.manage')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.userService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('core.user.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.userService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('core.user.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(user.organizationId, user.userId, id, dto);
  }

  @Get(':id/permissions')
  @RequirePermissions('core.user.manage')
  getPermissions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.userService.getPermissions(user.organizationId, id);
  }

  @Put(':id/permissions')
  @RequirePermissions('core.user.manage')
  setPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    return this.userService.setPermissions(user.organizationId, user.userId, id, dto.codes);
  }

  @Post(':id/roles')
  @RequirePermissions('core.user.manage')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.userService.assignRole(user.organizationId, user.userId, id, dto.roleId);
  }

  @Delete(':id/roles/:assignmentId')
  @RequirePermissions('core.user.manage')
  revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.userService.revokeRole(user.organizationId, user.userId, id, assignmentId);
  }
}
