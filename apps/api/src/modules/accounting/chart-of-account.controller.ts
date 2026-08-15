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

import { ChartOfAccountService } from './chart-of-account.service';
import type {
  CreateChartOfAccountDto,
  ImportCoaCsvDto,
  UpdateChartOfAccountDto,
} from './dto/chart-of-account.dto';

@Controller('accounting/coa')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChartOfAccountController {
  constructor(private readonly coaService: ChartOfAccountService) {}

  @Get()
  @RequirePermissions('accounting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountType') accountType?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('search') search?: string,
  ) {
    return this.coaService.findAll(user.organizationId, {
      ...(accountType ? { accountType } : {}),
      includeInactive: includeInactive === 'true',
      ...(search ? { search } : {}),
    });
  }

  @Get('tree')
  @RequirePermissions('accounting.read')
  findTree(@CurrentUser() user: AuthenticatedUser) {
    return this.coaService.findTree(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('accounting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.coaService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('accounting.coa.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChartOfAccountDto) {
    return this.coaService.create(user.organizationId, user.userId, dto);
  }

  @Post('import/preview')
  @RequirePermissions('accounting.coa.manage')
  importPreview(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportCoaCsvDto) {
    return this.coaService.importPreview(user.organizationId, dto.csv);
  }

  @Post('import/confirm')
  @RequirePermissions('accounting.coa.manage')
  importConfirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportCoaCsvDto) {
    return this.coaService.importConfirm(user.organizationId, user.userId, dto.csv);
  }

  @Patch(':id')
  @RequirePermissions('accounting.coa.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChartOfAccountDto,
  ) {
    return this.coaService.update(user.organizationId, id, user.userId, dto);
  }
}
