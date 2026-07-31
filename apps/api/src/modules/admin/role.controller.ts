import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RoleService } from './role.service';

@Controller('admin/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermissions('core.role.manage')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.roleService.list(user.organizationId);
  }

  @Get('permissions')
  @RequirePermissions('core.role.manage')
  listPermissions() {
    return this.roleService.listPermissions();
  }

  @Get(':id')
  @RequirePermissions('core.role.manage')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.roleService.findOne(user.organizationId, id);
  }

  @Post(':id/permissions')
  @RequirePermissions('core.role.manage')
  addPermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { permissionId: string },
  ) {
    return this.roleService.addPermission(user.organizationId, user.userId, id, body.permissionId);
  }

  @Delete(':id/permissions/:assignmentId')
  @RequirePermissions('core.role.manage')
  removePermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.roleService.removePermission(user.organizationId, user.userId, id, assignmentId);
  }
}
