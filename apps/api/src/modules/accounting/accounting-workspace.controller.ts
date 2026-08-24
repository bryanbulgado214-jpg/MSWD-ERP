import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

import { AccountingWorkspaceService } from './accounting-workspace.service';

class NotesDto {
  @IsString()
  @MaxLength(20000)
  content!: string;
}

class ReminderDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsDateString()
  dueDate!: string;
}

class UpdateReminderDto {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

@Controller('accounting/workspace')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingWorkspaceController {
  constructor(private readonly service: AccountingWorkspaceService) {}

  @Get()
  @RequirePermissions('accounting.read')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getWorkspace(user.organizationId, user.userId);
  }

  @Put('notes')
  @RequirePermissions('accounting.read')
  saveNotes(@CurrentUser() user: AuthenticatedUser, @Body() dto: NotesDto) {
    return this.service.saveNotes(user.organizationId, user.userId, dto.content);
  }

  @Post('reminders')
  @RequirePermissions('accounting.read')
  addReminder(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReminderDto) {
    return this.service.addReminder(user.organizationId, user.userId, dto.title, dto.dueDate);
  }

  @Patch('reminders/:id')
  @RequirePermissions('accounting.read')
  updateReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.service.updateReminder(user.organizationId, user.userId, id, dto);
  }

  @Delete('reminders/:id')
  @RequirePermissions('accounting.read')
  deleteReminder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deleteReminder(user.organizationId, user.userId, id);
  }
}
