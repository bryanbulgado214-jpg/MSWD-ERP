import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
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
import type { UpdatePpmpItemInput } from './ppmp.service';
import { PpmpService } from './ppmp.service';
import { AppItemService } from './app-item.service';

@Controller('procurement/ppmp-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PpmpController {
  constructor(
    private readonly ppmpService: PpmpService,
    private readonly appItemService: AppItemService,
  ) {}

  @Post()
  @RequirePermissions('procurement.ppmp.manage')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      fiscalYearId: string;
      departmentId: string;
      assignedUserId?: string;
      code: string;
      itemDescription: string;
      procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
      unitOfMeasure: string;
      quantity: number | string;
      estimatedUnitCost: number | string;
      modeOfProcurement?: string;
      scheduleQuarter?: number;
      cboNotes?: string;
    },
  ) {
    const item = await this.ppmpService.create(user.organizationId, {
      ...body,
      createdBy: user.userId,
    });
    // PPMPs constitute the APP — keep it generated in step with each item.
    await this.appItemService.consolidate(user.organizationId, body.fiscalYearId, user.userId);
    return item;
  }

  @Patch(':id')
  @RequirePermissions('procurement.ppmp.manage')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Omit<UpdatePpmpItemInput, 'updatedBy'>,
  ) {
    return this.ppmpService.update(user.organizationId, id, {
      ...body,
      updatedBy: user.userId,
    });
  }

  // Download the blank PPMP Excel template. Declared before ':id' so "template"
  // is not swallowed by the id route.
  @Get('template')
  @RequirePermissions('procurement.ppmp.manage')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="PPMP-Template.xlsx"')
  template() {
    return new StreamableFile(this.ppmpService.buildTemplate());
  }

  // Budget officer uploads a filled PPMP for one fiscal year + end-user office.
  @Post('upload')
  @RequirePermissions('procurement.ppmp.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { fiscalYearId: string; departmentId: string; assignedUserId?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!body.fiscalYearId || !body.departmentId) {
      throw new BadRequestException('A fiscal year and an end-user office are required.');
    }
    const result = await this.ppmpService.uploadExcel(user.organizationId, file.buffer, {
      fiscalYearId: body.fiscalYearId,
      departmentId: body.departmentId,
      ...(body.assignedUserId ? { defaultAssignedUserId: body.assignedUserId } : {}),
      actorUserId: user.userId,
    });
    // Uploaded PPMPs are approved budget and constitute the APP — generate it now.
    if (result.created > 0) {
      await this.appItemService.consolidate(user.organizationId, body.fiscalYearId, user.userId);
    }
    return result;
  }

  @Get('my')
  @RequirePermissions('procurement.read')
  async findMyItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.ppmpService.findMyItems(user.organizationId, user.userId, fiscalYearId);
  }

  // Approved PPMP allocations (with remaining amount/qty) for a specific
  // end-user — used when the purchase officer prepares a PR on their behalf.
  @Get('allocations')
  @RequirePermissions('procurement.read')
  async allocationsForUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    if (!assignedUserId) return [];
    return this.ppmpService.findMyItems(user.organizationId, assignedUserId, fiscalYearId);
  }

  @Get()
  @RequirePermissions('procurement.read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('status') status?: string,
  ) {
    return this.ppmpService.findAll(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ppmpService.findOne(user.organizationId, id);
  }

  @Get(':id/remaining')
  @RequirePermissions('procurement.read')
  async getRemainingAmount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ppmpService.getRemainingPlannedAmount(user.organizationId, id);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.ppmp.manage')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ppmpService.approve(user.organizationId, id, user.userId);
  }

  @Post('bulk-approve')
  @RequirePermissions('procurement.ppmp.manage')
  async bulkApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { ids: string[] },
  ) {
    return this.ppmpService.bulkApprove(user.organizationId, body.ids, user.userId);
  }
}
