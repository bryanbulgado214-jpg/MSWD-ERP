import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { UpdatePpmpItemInput } from './ppmp.service';
import { PpmpService } from './ppmp.service';

@Controller('procurement/ppmp-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PpmpController {
  constructor(private readonly ppmpService: PpmpService) {}

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
    return this.ppmpService.create(user.organizationId, {
      ...body,
      createdBy: user.userId,
    });
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

  @Get('my')
  @RequirePermissions('procurement.read')
  async findMyItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.ppmpService.findMyItems(user.organizationId, user.userId, fiscalYearId);
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
