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
      endUserId?: string;
      code: string;
      itemDescription: string;
      procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
      unitOfMeasure: string;
      quantity: number | string;
      estimatedUnitCost: number | string;
      modeOfProcurement?: string;
      scheduleQuarter?: number;
      scheduleByQuarter?: Record<string, number> | null;
      cboNotes?: string;
      status?: 'draft' | 'approved';
    },
  ) {
    const item = await this.ppmpService.create(user.organizationId, {
      ...body,
      createdBy: user.userId,
    });
    // Approved PPMPs constitute the APP — reconsolidate; drafts don't affect it.
    if ((body.status ?? 'approved') === 'approved') {
      await this.appItemService.consolidate(user.organizationId, body.fiscalYearId, user.userId);
    }
    return item;
  }

  // Save a whole PPMP for one end-user at once (one transaction, one APP pass).
  @Post('batch')
  @RequirePermissions('procurement.ppmp.manage')
  async createBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      fiscalYearId: string;
      departmentId: string;
      endUserId?: string;
      assignedUserId?: string;
      status?: 'draft' | 'approved';
      items: Array<{
        code: string;
        itemDescription: string;
        procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
        unitOfMeasure: string;
        quantity: number | string;
        estimatedUnitCost: number | string;
        modeOfProcurement?: string;
        scheduleQuarter?: number;
        scheduleByQuarter?: Record<string, number> | null;
        cboNotes?: string;
      }>;
    },
  ) {
    if (!body.items?.length) throw new BadRequestException('At least one item is required.');
    if (!body.fiscalYearId || !body.departmentId) {
      throw new BadRequestException('A fiscal year and a section are required.');
    }
    const created = await this.ppmpService.createBatch(
      user.organizationId,
      {
        fiscalYearId: body.fiscalYearId,
        departmentId: body.departmentId,
        ...(body.endUserId ? { endUserId: body.endUserId } : {}),
        ...(body.assignedUserId ? { assignedUserId: body.assignedUserId } : {}),
        ...(body.status ? { status: body.status } : {}),
        createdBy: user.userId,
      },
      body.items,
    );
    if ((body.status ?? 'approved') === 'approved') {
      await this.appItemService.consolidate(user.organizationId, body.fiscalYearId, user.userId);
    }
    return created;
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
    @Body() body: {
      fiscalYearId: string;
      departmentId: string;
      assignedUserId?: string;
      endUserId?: string;
    },
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!body.fiscalYearId || !body.departmentId) {
      throw new BadRequestException('A fiscal year and a section are required.');
    }
    const result = await this.ppmpService.uploadExcel(user.organizationId, file.buffer, {
      fiscalYearId: body.fiscalYearId,
      departmentId: body.departmentId,
      ...(body.assignedUserId ? { defaultAssignedUserId: body.assignedUserId } : {}),
      ...(body.endUserId ? { defaultEndUserId: body.endUserId } : {}),
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
    @Query('endUserId') endUserId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    if (endUserId) {
      return this.ppmpService.allocationsForEndUser(user.organizationId, endUserId, fiscalYearId);
    }
    // Legacy: allocations keyed on a login account (pre end-user master).
    if (assignedUserId) {
      return this.ppmpService.findMyItems(user.organizationId, assignedUserId, fiscalYearId);
    }
    return [];
  }

  @Get()
  @RequirePermissions('procurement.read')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('endUserId') endUserId?: string,
    @Query('status') status?: string,
  ) {
    return this.ppmpService.findAll(user.organizationId, {
      ...(fiscalYearId ? { fiscalYearId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(endUserId ? { endUserId } : {}),
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

  // Documents (POs + their DVs) that recorded actual acquisitions of this PPMP
  // item — the "purchased to date" drill-down on the PR form.
  @Get(':id/acquisitions')
  @RequirePermissions('procurement.read')
  async acquisitions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ppmpService.acquisitionsForPpmpItem(user.organizationId, id);
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
