import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';
import type { CreateBillingPeriodDto, TransitionPeriodDto, UpdateBillingPeriodDto } from './dto/billing-period.dto';

@Injectable()
export class BillingPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, filters?: { status?: string; year?: number }) {
    return this.prisma.billingPeriod.findMany({
      where: {
        organizationId: orgId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.year ? { billingYear: filters.year } : {}),
      },
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { meterReadings: true, bills: true } },
      },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
    });
  }

  async findOne(orgId: string, id: string) {
    const period = await this.prisma.billingPeriod.findFirst({
      where: { id, organizationId: orgId },
      include: {
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
        _count: { select: { meterReadings: true, bills: true } },
      },
    });
    if (!period) throw new NotFoundException('Billing period not found.');
    return period;
  }

  async create(orgId: string, userId: string, dto: CreateBillingPeriodDto) {
    const existing = await this.prisma.billingPeriod.findUnique({
      where: {
        organizationId_billingMonth_billingYear: {
          organizationId: orgId,
          billingMonth: dto.billingMonth,
          billingYear: dto.billingYear,
        },
      },
    });
    if (existing) throw new ConflictException(`Billing period for ${dto.billingMonth}/${dto.billingYear} already exists.`);

    return runAudited(this.prisma, userId, (tx) =>
      tx.billingPeriod.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          billingMonth: dto.billingMonth,
          billingYear: dto.billingYear,
          ...(dto.readingStartDate ? { readingStartDate: new Date(dto.readingStartDate) } : {}),
          ...(dto.readingEndDate ? { readingEndDate: new Date(dto.readingEndDate) } : {}),
          dueDate: new Date(dto.dueDate),
          penaltyDate: new Date(dto.penaltyDate),
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          creator: { select: { id: true, username: true } },
          _count: { select: { meterReadings: true, bills: true } },
        },
      }),
    );
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateBillingPeriodDto) {
    const existing = await this.prisma.billingPeriod.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Billing period not found.');
    if (existing.version !== dto.expectedVersion)
      throw new ConflictException('Billing period was modified by another user — please reload.');
    if (existing.status === 'closed')
      throw new BadRequestException('Cannot modify a closed billing period.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.billingPeriod.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.readingStartDate ? { readingStartDate: new Date(dto.readingStartDate) } : {}),
          ...(dto.readingEndDate ? { readingEndDate: new Date(dto.readingEndDate) } : {}),
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
          ...(dto.penaltyDate ? { penaltyDate: new Date(dto.penaltyDate) } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        include: {
          creator: { select: { id: true, username: true } },
          updater: { select: { id: true, username: true } },
          _count: { select: { meterReadings: true, bills: true } },
        },
      }),
    );
  }

  async transition(orgId: string, userId: string, id: string, dto: TransitionPeriodDto) {
    const existing = await this.prisma.billingPeriod.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Billing period not found.');
    if (existing.version !== dto.expectedVersion)
      throw new ConflictException('Billing period was modified — please reload.');

    const validTransitions: Record<string, string[]> = {
      open: ['reading'],
      reading: ['billing'],
      billing: ['closed'],
    };
    const allowed = validTransitions[existing.status] ?? [];
    if (!allowed.includes(dto.status))
      throw new BadRequestException(`Cannot transition from "${existing.status}" to "${dto.status}".`);

    return runAudited(this.prisma, userId, (tx) =>
      tx.billingPeriod.update({
        where: { id },
        data: {
          status: dto.status as any,
          updatedBy: userId,
          version: { increment: 1 },
        },
        include: {
          creator: { select: { id: true, username: true } },
          updater: { select: { id: true, username: true } },
          _count: { select: { meterReadings: true, bills: true } },
        },
      }),
    );
  }
}
