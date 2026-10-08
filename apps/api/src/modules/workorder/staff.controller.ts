import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { CreateStaffDto, SetStaffStatusDto, UpdateStaffDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

// Staff availability master list. Section heads view it (workorder.read); only
// the admin edits records and statuses (workorder.staff.manage). Full paths (no
// controller base) so they don't collide with /workorders/:id.
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get('workorder-staff')
  @RequirePermissions('workorder.read')
  list(@CurrentUser() u: AuthenticatedUser) {
    return this.staff.list(u.organizationId);
  }

  @Get('workorder-staff/link-options')
  @RequirePermissions('workorder.staff.manage')
  linkOptions(@CurrentUser() u: AuthenticatedUser) {
    return this.staff.linkOptions(u.organizationId);
  }

  @Post('workorder-staff')
  @RequirePermissions('workorder.staff.manage')
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.staff.create(u.organizationId, u.userId, dto);
  }

  @Patch('workorder-staff/:id')
  @RequirePermissions('workorder.staff.manage')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(u.organizationId, u.userId, id, dto);
  }

  @Patch('workorder-staff/:id/status')
  @RequirePermissions('workorder.staff.manage')
  setStatus(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStaffStatusDto,
  ) {
    return this.staff.setStatus(u.organizationId, u.userId, id, dto);
  }

  @Delete('workorder-staff/:id')
  @RequirePermissions('workorder.staff.manage')
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.remove(u.organizationId, u.userId, id);
  }
}
