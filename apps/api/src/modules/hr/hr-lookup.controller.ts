import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('hr/lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HrLookupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('departments')
  @RequirePermissions('hr.read')
  getDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.department.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('users')
  @RequirePermissions('hr.read')
  getUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, username: true, email: true },
      orderBy: { username: 'asc' },
    });
  }
}
