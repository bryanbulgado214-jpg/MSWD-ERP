import {
  Body,
  Controller,
  Delete,
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

import { DisbursementService } from './disbursement.service';
import { CreateDisbursementDto } from './dto/disbursement.dto';

@Controller('accounting/disbursements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @Get()
  @RequirePermissions('accounting.dv.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('dvType') dvType?: string,
  ) {
    return this.disbursementService.list(user.organizationId, {
      ...(status ? { status } : {}),
      ...(dvType ? { dvType } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('accounting.dv.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.dv.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDisbursementDto) {
    return this.disbursementService.create(user.organizationId, user.userId, dto);
  }

  @Post(':id/post')
  @RequirePermissions('accounting.dv.create')
  postDraft(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.postDraft(user.organizationId, user.userId, id);
  }

  @Patch(':id')
  @RequirePermissions('accounting.dv.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDisbursementDto,
  ) {
    return this.disbursementService.update(user.organizationId, user.userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('accounting.dv.create')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disbursementService.remove(user.organizationId, user.userId, id);
  }
}
