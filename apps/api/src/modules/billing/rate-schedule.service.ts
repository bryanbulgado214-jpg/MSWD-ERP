import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { CreateRateScheduleDto, UpdateRateScheduleDto } from './dto/rate-schedule.dto';

@Injectable()
export class RateScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, filters?: { consumerType?: string; activeOnly?: boolean }) {
    return this.prisma.rateSchedule.findMany({
      where: {
        organizationId: orgId,
        ...(filters?.consumerType ? { consumerType: filters.consumerType as any } : {}),
        ...(filters?.activeOnly ? { isActive: true } : {}),
      },
      include: {
        tiers: { orderBy: { sortOrder: 'asc' } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: [{ consumerType: 'asc' }, { effectiveDate: 'desc' }],
    });
  }

  async findOne(orgId: string, id: string) {
    const schedule = await this.prisma.rateSchedule.findFirst({
      where: { id, organizationId: orgId },
      include: {
        tiers: { orderBy: { sortOrder: 'asc' } },
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
      },
    });
    if (!schedule) throw new NotFoundException('Rate schedule not found.');
    return schedule;
  }

  async create(orgId: string, userId: string, dto: CreateRateScheduleDto) {
    return runAudited(this.prisma, userId, (tx) =>
      tx.rateSchedule.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          consumerType: dto.consumerType as any,
          effectiveDate: new Date(dto.effectiveDate),
          ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
          minimumCharge: dto.minimumCharge,
          ...(dto.minimumConsumption !== undefined
            ? { minimumConsumption: dto.minimumConsumption }
            : {}),
          ...(dto.environmentalFee !== undefined ? { environmentalFee: dto.environmentalFee } : {}),
          ...(dto.sewerCharge !== undefined ? { sewerCharge: dto.sewerCharge } : {}),
          ...(dto.maintenanceFee !== undefined ? { maintenanceFee: dto.maintenanceFee } : {}),
          createdBy: userId,
          updatedBy: userId,
          tiers: {
            create: dto.tiers.map((t, i) => ({
              minConsumption: t.minConsumption,
              ...(t.maxConsumption != null ? { maxConsumption: t.maxConsumption } : {}),
              ratePerCubicMeter: t.ratePerCubicMeter,
              sortOrder: t.sortOrder ?? i,
            })),
          },
        },
        include: { tiers: { orderBy: { sortOrder: 'asc' } } },
      }),
    );
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateRateScheduleDto) {
    const existing = await this.prisma.rateSchedule.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Rate schedule not found.');
    if (existing.version !== dto.expectedVersion)
      throw new ConflictException('Rate schedule was modified by another user — please reload.');

    return runAudited(this.prisma, userId, async (tx) => {
      if (dto.tiers) {
        await tx.rateTier.deleteMany({ where: { rateScheduleId: id } });
        await tx.rateTier.createMany({
          data: dto.tiers.map((t, i) => ({
            rateScheduleId: id,
            minConsumption: t.minConsumption,
            ...(t.maxConsumption != null ? { maxConsumption: t.maxConsumption } : {}),
            ratePerCubicMeter: t.ratePerCubicMeter,
            sortOrder: t.sortOrder ?? i,
          })),
        });
      }

      return tx.rateSchedule.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.effectiveDate ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
            : {}),
          ...(dto.minimumCharge !== undefined ? { minimumCharge: dto.minimumCharge } : {}),
          ...(dto.minimumConsumption !== undefined
            ? { minimumConsumption: dto.minimumConsumption }
            : {}),
          ...(dto.environmentalFee !== undefined ? { environmentalFee: dto.environmentalFee } : {}),
          ...(dto.sewerCharge !== undefined ? { sewerCharge: dto.sewerCharge } : {}),
          ...(dto.maintenanceFee !== undefined ? { maintenanceFee: dto.maintenanceFee } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        include: { tiers: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }
}
