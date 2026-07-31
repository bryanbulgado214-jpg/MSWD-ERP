import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { PurchaseRequestStatus } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreatePurchaseRequestDto, PurchaseRequestActionDto, UpdatePurchaseRequestDto } from './dto/purchase-request.dto';
import { PurchaseRequestService } from './purchase-request.service';

@Controller('procurement/purchase-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseRequestsController {
  constructor(
    private readonly prService: PurchaseRequestService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @RequirePermissions('procurement.pr.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseRequestDto) {
    return this.prService.create(user.organizationId, { ...dto, createdBy: user.userId });
  }

  @Get()
  @RequirePermissions('procurement.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status: status as PurchaseRequestStatus } : {}),
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        budgetRelease: { select: { releaseNumber: true, budgetHeader: { select: { id: true } } } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('my')
  @RequirePermissions('procurement.read')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.prService.findAllForUser(user.organizationId, user.userId, {
      ...(status ? { status } : {}),
    });
  }

  @Get('pending-endorsement')
  @RequirePermissions('procurement.pr.endorse')
  findPendingEndorsement(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'submitted',
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('pending-budget-certification')
  @RequirePermissions('procurement.pr.budget_certify')
  findPendingBudgetCertification(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'endorsed',
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
        budgetRelease: { select: { releaseNumber: true, availableAmount: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('pending-approval')
  @RequirePermissions('procurement.pr.final_approve')
  findPendingApproval(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'budget_certified',
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('pending-procurement')
  @RequirePermissions('procurement.pr.accept_procurement')
  findPendingProcurement(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'approved',
      },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        department: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get(':id')
  @RequirePermissions('procurement.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.purchaseRequest.findFirstOrThrow({
      where: { id, organizationId: user.organizationId },
      include: {
        items: { orderBy: { itemNumber: 'asc' } },
        budgetRelease: {
          select: {
            releaseNumber: true,
            availableAmount: true,
            budgetHeader: {
              select: {
                responsibilityCenter: { select: { id: true, code: true, name: true } },
                fundSource: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        department: { select: { id: true, code: true, name: true } },
        responsibilityCenter: { select: { id: true, code: true, name: true } },
        fundSource: { select: { id: true, code: true, name: true } },
        departmentHead: { select: { id: true, username: true } },
        endorser: { select: { id: true, username: true } },
        budgetCertifier: { select: { id: true, username: true } },
        approver: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        ppmpItem: { select: { id: true, code: true, itemDescription: true } },
        appItem: { select: { id: true, appNumber: true, procurementProjectTitle: true } },
        revisions: { orderBy: { revisionNumber: 'desc' } },
      },
    });
  }

  @Patch(':id')
  @RequirePermissions('procurement.pr.edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestDto,
  ) {
    const { expectedVersion, ...edit } = dto;
    return this.prService.update(user.organizationId, id, expectedVersion, { ...edit, updatedBy: user.userId });
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.pr.submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.submit(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/endorse')
  @RequirePermissions('procurement.pr.endorse')
  endorse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.endorse(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/budget-certify')
  @RequirePermissions('procurement.pr.budget_certify')
  budgetCertify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.budgetCertify(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.pr.final_approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.finalApprove(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/accept-procurement')
  @RequirePermissions('procurement.pr.accept_procurement')
  acceptProcurement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.acceptForProcurement(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/return')
  @RequirePermissions('procurement.pr.return_to_user')
  returnForCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.returnForCorrection(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/reject')
  @RequirePermissions('procurement.pr.reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.reject(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.pr.cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.cancel(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/lifecycle')
  @RequirePermissions('procurement.pr.mark_lifecycle')
  markLifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { expectedVersion: number; targetStatus: string },
  ) {
    return this.prService.markLifecycle(
      user.organizationId,
      id,
      body.expectedVersion,
      body.targetStatus as any,
      user.userId,
    );
  }

  @Post(':id/inspect')
  @RequirePermissions('procurement.pr.inspect')
  inspect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseRequestActionDto,
  ) {
    return this.prService.inspect(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }
}
