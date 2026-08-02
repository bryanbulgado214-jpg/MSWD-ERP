import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';
import type { CreateMeterReadingDto, UpdateMeterReadingDto } from './dto/meter-reading.dto';

@Injectable()
export class MeterReadingService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriod(orgId: string, billingPeriodId: string) {
    return this.prisma.meterReading.findMany({
      where: { organizationId: orgId, billingPeriodId },
      include: {
        consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, consumerType: true, status: true } },
        meter: { select: { id: true, serialNumber: true } },
        reader: { select: { id: true, username: true } },
      },
      orderBy: { consumer: { accountNumber: 'asc' } },
    });
  }

  async findOne(orgId: string, id: string) {
    const reading = await this.prisma.meterReading.findFirst({
      where: { id, organizationId: orgId },
      include: {
        consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, consumerType: true } },
        meter: { select: { id: true, serialNumber: true, brand: true } },
        billingPeriod: { select: { id: true, name: true, billingMonth: true, billingYear: true } },
        reader: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
      },
    });
    if (!reading) throw new NotFoundException('Meter reading not found.');
    return reading;
  }

  async create(orgId: string, userId: string, dto: CreateMeterReadingDto) {
    const period = await this.prisma.billingPeriod.findFirst({
      where: { id: dto.billingPeriodId, organizationId: orgId },
    });
    if (!period) throw new NotFoundException('Billing period not found.');
    if (period.status !== 'reading' && period.status !== 'open')
      throw new BadRequestException('Billing period is not open for reading entry.');

    const existing = await this.prisma.meterReading.findUnique({
      where: { consumerId_billingPeriodId: { consumerId: dto.consumerId, billingPeriodId: dto.billingPeriodId } },
    });
    if (existing) throw new ConflictException('A reading already exists for this consumer in this billing period.');

    if (dto.currentReading < dto.previousReading)
      throw new BadRequestException('Current reading cannot be less than previous reading.');

    const consumption = dto.currentReading - dto.previousReading;

    return runAudited(this.prisma, userId, async (tx) => {
      const reading = await tx.meterReading.create({
        data: {
          organizationId: orgId,
          consumerId: dto.consumerId,
          meterId: dto.meterId,
          billingPeriodId: dto.billingPeriodId,
          readingDate: new Date(dto.readingDate),
          previousReading: dto.previousReading,
          currentReading: dto.currentReading,
          consumption,
          ...(dto.remarks ? { remarks: dto.remarks } : {}),
          readerId: userId,
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, consumerType: true, status: true } },
          meter: { select: { id: true, serialNumber: true } },
        },
      });

      return reading;
    });
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateMeterReadingDto) {
    const existing = await this.prisma.meterReading.findFirst({
      where: { id, organizationId: orgId },
      include: { billingPeriod: true },
    });
    if (!existing) throw new NotFoundException('Meter reading not found.');
    if (existing.billingPeriod.status === 'closed')
      throw new BadRequestException('Cannot modify readings in a closed billing period.');

    const currentReading = dto.currentReading ?? Number(existing.currentReading);
    const previousReading = Number(existing.previousReading);
    if (currentReading < previousReading)
      throw new BadRequestException('Current reading cannot be less than previous reading.');

    const consumption = currentReading - previousReading;

    return runAudited(this.prisma, userId, async (tx) => {
      const reading = await tx.meterReading.update({
        where: { id },
        data: {
          ...(dto.currentReading !== undefined ? { currentReading: dto.currentReading } : {}),
          ...(dto.readingDate ? { readingDate: new Date(dto.readingDate) } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
          ...(dto.status ? { status: dto.status as any } : {}),
          consumption,
          updatedBy: userId,
        },
        include: {
          consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, consumerType: true, status: true } },
          meter: { select: { id: true, serialNumber: true } },
        },
      });

      return reading;
    });
  }

  async getUnreadConsumers(orgId: string, billingPeriodId: string) {
    const existingReadings = await this.prisma.meterReading.findMany({
      where: { organizationId: orgId, billingPeriodId },
      select: { consumerId: true },
    });
    const readConsumerIds = existingReadings.map((r) => r.consumerId);

    return this.prisma.consumer.findMany({
      where: {
        organizationId: orgId,
        status: 'active',
        id: { notIn: readConsumerIds.length > 0 ? readConsumerIds : ['00000000-0000-0000-0000-000000000000'] },
        consumerMeters: { some: { isCurrent: true } },
      },
      include: {
        consumerMeters: {
          where: { isCurrent: true },
          include: { meter: { select: { id: true, serialNumber: true, initialReading: true } } },
        },
      },
      orderBy: { accountNumber: 'asc' },
    });
  }
}
