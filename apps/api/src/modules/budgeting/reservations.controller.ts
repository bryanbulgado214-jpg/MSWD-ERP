import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateReservationDto, ReservationActionDto, UpdateReservationDraftDto } from './dto/reservation.dto';
import { ReservationService } from './reservation.service';

@Controller('budgeting/reservations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReservationsController {
  constructor(
    private readonly reservationService: ReservationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @RequirePermissions('budgeting.reservation.create')
  createDraft(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservationService.createDraft(user.organizationId, { ...dto, createdBy: user.userId });
  }

  @Get()
  @RequirePermissions('budgeting.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('budgetReleaseId') budgetReleaseId?: string,
    @Query('budgetHeaderId') budgetHeaderId?: string,
  ) {
    if (!budgetReleaseId && !budgetHeaderId) {
      throw new BadRequestException('Provide either budgetReleaseId or budgetHeaderId.');
    }
    return this.prisma.budgetReservation.findMany({
      where: {
        organizationId: user.organizationId,
        // The guard above guarantees one of these two is present — the
        // non-null assertion here reflects that already-checked
        // invariant, not an unchecked assumption.
        ...(budgetReleaseId ? { budgetReleaseId } : { budgetRelease: { budgetHeaderId: budgetHeaderId! } }),
      },
      include: { budgetRelease: { select: { releaseNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @RequirePermissions('budgeting.read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.budgetReservation.findFirstOrThrow({
      where: { id, organizationId: user.organizationId },
    });
  }

  @Patch(':id')
  @RequirePermissions('budgeting.reservation.edit')
  editDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationDraftDto,
  ) {
    const { expectedVersion, ...edit } = dto;
    return this.reservationService.editDraft(user.organizationId, id, expectedVersion, { ...edit, updatedBy: user.userId });
  }

  @Post(':id/submit')
  @RequirePermissions('budgeting.reservation.submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationActionDto,
  ) {
    return this.reservationService.submit(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/approve')
  @RequirePermissions('budgeting.reservation.approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationActionDto,
  ) {
    return this.reservationService.approve(user.organizationId, id, dto.expectedVersion, user.userId);
  }

  @Post(':id/reject')
  @RequirePermissions('budgeting.reservation.reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationActionDto,
  ) {
    return this.reservationService.reject(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }

  @Post(':id/cancel')
  @RequirePermissions('budgeting.reservation.cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationActionDto,
  ) {
    return this.reservationService.cancel(user.organizationId, id, dto.expectedVersion, user.userId, dto.remarks);
  }
}
