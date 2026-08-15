import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { CreateMeterDto, UpdateMeterDto } from './dto/meter.dto';

@Injectable()
export class MeterService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, filters?: { status?: string; search?: string }) {
    return this.prisma.meter.findMany({
      where: {
        organizationId: orgId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.search
          ? {
              OR: [
                { serialNumber: { contains: filters.search, mode: 'insensitive' as const } },
                { brand: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        consumerMeters: {
          where: { isCurrent: true },
          include: {
            consumer: {
              select: { id: true, accountNumber: true, firstName: true, lastName: true },
            },
          },
        },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { serialNumber: 'asc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const meter = await this.prisma.meter.findFirst({
      where: { id, organizationId: orgId },
      include: {
        consumerMeters: {
          include: {
            consumer: {
              select: {
                id: true,
                accountNumber: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
          orderBy: { installedDate: 'desc' },
        },
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
      },
    });
    if (!meter) throw new NotFoundException('Meter not found.');
    return meter;
  }

  async create(orgId: string, userId: string, dto: CreateMeterDto) {
    return runAudited(this.prisma, userId, (tx) =>
      tx.meter.create({
        data: {
          organizationId: orgId,
          serialNumber: dto.serialNumber,
          ...(dto.brand ? { brand: dto.brand } : {}),
          ...(dto.size ? { size: dto.size as any } : {}),
          ...(dto.initialReading !== undefined ? { initialReading: dto.initialReading } : {}),
          ...(dto.notes ? { notes: dto.notes } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
      }),
    );
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateMeterDto) {
    const existing = await this.prisma.meter.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Meter not found.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.meter.update({
        where: { id },
        data: {
          ...(dto.brand !== undefined ? { brand: dto.brand || null } : {}),
          ...(dto.status ? { status: dto.status as any } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          updatedBy: userId,
        },
      }),
    );
  }

  async getUnassigned(orgId: string) {
    return this.prisma.meter.findMany({
      where: {
        organizationId: orgId,
        status: 'active',
        consumerMeters: { none: { isCurrent: true } },
      },
      orderBy: { serialNumber: 'asc' },
    });
  }
}
