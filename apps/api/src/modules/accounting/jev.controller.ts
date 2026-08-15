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

import { CreateJevDto, PostJevDto, ReverseJevDto, UpdateJevDto, VoidJevDto } from './dto/jev.dto';
import { JevService } from './jev.service';

@Controller('accounting/jev')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JevController {
  constructor(private readonly jevService: JevService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('periodId') periodId?: string,
    @Query('search') search?: string,
  ) {
    return this.jevService.findAll(user.organizationId, {
      ...(status ? { status } : {}),
      ...(periodId ? { periodId } : {}),
      ...(search ? { search } : {}),
    });
  }

  @Get('periods')
  @RequirePermissions('accounting.read')
  getOpenPeriods(@CurrentUser() user: AuthenticatedUser) {
    return this.jevService.getOpenPeriods(user.organizationId);
  }

  @Get('by-source/:sourceTable/:sourceId')
  @RequirePermissions('accounting.read')
  findBySource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceTable') sourceTable: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
  ) {
    return this.jevService.findBySource(user.organizationId, sourceTable, sourceId);
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jevService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.jev.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJevDto) {
    return this.jevService.create(user.organizationId, user.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('accounting.jev.create')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJevDto,
  ) {
    return this.jevService.update(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('accounting.jev.create')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostJevDto,
  ) {
    return this.jevService.submit(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions('accounting.jev.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostJevDto,
  ) {
    return this.jevService.approve(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/post')
  @RequirePermissions('accounting.jev.post')
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostJevDto,
  ) {
    return this.jevService.post(user.organizationId, id, user.userId, dto.expectedVersion);
  }

  @Post(':id/void')
  @RequirePermissions('accounting.jev.void')
  void(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidJevDto,
  ) {
    return this.jevService.void(user.organizationId, id, user.userId, dto);
  }

  @Post(':id/reverse')
  @RequirePermissions('accounting.jev.reverse')
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseJevDto,
  ) {
    return this.jevService.reverse(user.organizationId, id, user.userId, dto);
  }
}
