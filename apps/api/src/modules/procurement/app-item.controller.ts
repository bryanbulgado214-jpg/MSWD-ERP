import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AppItemService } from './app-item.service';

@Controller('procurement/app-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppItemController {
  constructor(private readonly appItemService: AppItemService) {}

  @Post()
  @RequirePermissions('procurement.app.manage')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      fiscalYearId: string;
      ppmpItemId?: string;
      appNumber?: string;
      procurementProjectTitle: string;
      procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
      approvedBudget: number | string;
      procurementMode?: string;
      scheduleMonth?: number;
      departmentId?: string;
      endUserId?: string;
      quantity?: number | string;
      unitOfMeasure?: string;
      estimatedUnitCost?: number | string;
      classification?: 'inventory' | 'asset' | 'expense' | 'infrastructure' | 'service';
    },
  ) {
    return this.appItemService.create(user.organizationId, {
      ...body,
      createdBy: user.userId,
    });
  }

  // Download the "Upload Official APP" Excel template.
  @Get('template')
  @RequirePermissions('procurement.app.manage')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="APP-Template.xlsx"')
  template() {
    return new StreamableFile(this.appItemService.buildTemplate());
  }

  // Bulk-upload the official APP (direct items not in any PPMP) for a year.
  @Post('upload')
  @RequirePermissions('procurement.app.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { fiscalYearId: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!body.fiscalYearId) throw new BadRequestException('A fiscal year is required.');
    return this.appItemService.uploadExcel(user.organizationId, file.buffer, {
      fiscalYearId: body.fiscalYearId,
      actorUserId: user.userId,
    });
  }

  // Generate/refresh the APP by consolidating all approved PPMP items for a year.
  @Post('consolidate')
  @RequirePermissions('procurement.app.manage')
  async consolidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { fiscalYearId: string },
  ) {
    return this.appItemService.consolidate(user.organizationId, body.fiscalYearId, user.userId);
  }

  @Get()
  @RequirePermissions('procurement.read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('status') status?: string,
  ) {
    return this.appItemService.findAll(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appItemService.findOne(user.organizationId, id);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.app.manage')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appItemService.approve(user.organizationId, id, user.userId);
  }
}
