import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { CreateConsumerDto, UpdateConsumerDto } from './dto/consumer.dto';

@Injectable()
export class ConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    orgId: string,
    filters?: {
      status?: string;
      consumerType?: string;
      barangay?: string;
      search?: string;
    },
  ) {
    return this.prisma.consumer.findMany({
      where: {
        organizationId: orgId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.consumerType ? { consumerType: filters.consumerType as any } : {}),
        ...(filters?.barangay ? { barangay: filters.barangay } : {}),
        ...(filters?.search
          ? {
              OR: [
                { accountNumber: { contains: filters.search, mode: 'insensitive' as const } },
                { firstName: { contains: filters.search, mode: 'insensitive' as const } },
                { lastName: { contains: filters.search, mode: 'insensitive' as const } },
                { businessName: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        consumerMeters: {
          where: { isCurrent: true },
          include: { meter: true },
        },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { accountNumber: 'asc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const consumer = await this.prisma.consumer.findFirst({
      where: { id, organizationId: orgId },
      include: {
        consumerMeters: {
          include: { meter: true },
          orderBy: { installedDate: 'desc' },
        },
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
      },
    });
    if (!consumer) throw new NotFoundException('Consumer not found.');
    return consumer;
  }

  async create(orgId: string, userId: string, dto: CreateConsumerDto) {
    return runAudited(this.prisma, userId, (tx) =>
      tx.consumer.create({
        data: {
          organizationId: orgId,
          accountNumber: dto.accountNumber,
          firstName: dto.firstName,
          ...(dto.middleName ? { middleName: dto.middleName } : {}),
          lastName: dto.lastName,
          ...(dto.businessName ? { businessName: dto.businessName } : {}),
          ...(dto.consumerType ? { consumerType: dto.consumerType as any } : {}),
          address: dto.address,
          ...(dto.barangay ? { barangay: dto.barangay } : {}),
          ...(dto.municipality ? { municipality: dto.municipality } : {}),
          ...(dto.province ? { province: dto.province } : {}),
          ...(dto.contactNumber ? { contactNumber: dto.contactNumber } : {}),
          ...(dto.email ? { email: dto.email } : {}),
          ...(dto.isSeniorCitizen !== undefined ? { isSeniorCitizen: dto.isSeniorCitizen } : {}),
          ...(dto.isPwd !== undefined ? { isPwd: dto.isPwd } : {}),
          ...(dto.connectionDate ? { connectionDate: new Date(dto.connectionDate) } : {}),
          ...(dto.notes ? { notes: dto.notes } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
      }),
    );
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateConsumerDto) {
    const existing = await this.prisma.consumer.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Consumer not found.');
    if (existing.version !== dto.expectedVersion)
      throw new ConflictException('Consumer was modified by another user — please reload.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.consumer.update({
        where: { id },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName } : {}),
          ...(dto.middleName !== undefined ? { middleName: dto.middleName || null } : {}),
          ...(dto.lastName ? { lastName: dto.lastName } : {}),
          ...(dto.businessName !== undefined ? { businessName: dto.businessName || null } : {}),
          ...(dto.address ? { address: dto.address } : {}),
          ...(dto.barangay !== undefined ? { barangay: dto.barangay || null } : {}),
          ...(dto.contactNumber !== undefined ? { contactNumber: dto.contactNumber || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          ...(dto.isSeniorCitizen !== undefined ? { isSeniorCitizen: dto.isSeniorCitizen } : {}),
          ...(dto.isPwd !== undefined ? { isPwd: dto.isPwd } : {}),
          ...(dto.status ? { status: dto.status as any } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
      }),
    );
  }

  async assignMeter(
    orgId: string,
    userId: string,
    consumerId: string,
    dto: { meterId: string; installedDate: string; remarks?: string },
  ) {
    const consumer = await this.prisma.consumer.findFirst({
      where: { id: consumerId, organizationId: orgId },
    });
    if (!consumer) throw new NotFoundException('Consumer not found.');

    const meter = await this.prisma.meter.findFirst({
      where: { id: dto.meterId, organizationId: orgId, status: 'active' },
    });
    if (!meter) throw new NotFoundException('Meter not found or not active.');

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.consumerMeter.updateMany({
        where: { consumerId, isCurrent: true },
        data: { isCurrent: false, removedDate: new Date(dto.installedDate) },
      });

      return tx.consumerMeter.create({
        data: {
          consumerId,
          meterId: dto.meterId,
          installedDate: new Date(dto.installedDate),
          isCurrent: true,
          ...(dto.remarks ? { installationRemarks: dto.remarks } : {}),
        },
        include: { meter: true },
      });
    });
  }

  async getBarangays(orgId: string) {
    const rows = await this.prisma.consumer.groupBy({
      by: ['barangay'],
      where: { organizationId: orgId, barangay: { not: null } },
      orderBy: { barangay: 'asc' },
    });
    return rows.map((r) => r.barangay).filter(Boolean);
  }
}
