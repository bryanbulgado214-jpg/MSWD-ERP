import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { CreatePayeeDto, UpdatePayeeDto } from './dto/payee.dto';

@Injectable()
export class PayeeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, opts?: { search?: string; includeInactive?: boolean }) {
    const where: Prisma.PayeeWhereInput = {
      organizationId: orgId,
      // Absorbed (merged-away) payees drop off the list.
      mergedIntoId: null,
      ...(opts?.includeInactive ? {} : { isActive: true }),
    };
    if (opts?.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { tin: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.payee.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        address: true,
        tin: true,
        isActive: true,
        version: true,
      },
    });
    return rows;
  }

  async create(orgId: string, userId: string, dto: CreatePayeeDto) {
    return this.prisma.payee.create({
      data: {
        organizationId: orgId,
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        tin: dto.tin?.trim() || null,
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true, name: true, address: true, tin: true, isActive: true, version: true },
    });
  }

  async update(orgId: string, userId: string, id: string, dto: UpdatePayeeDto) {
    const payee = await this.prisma.payee.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!payee) throw new NotFoundException('Payee not found.');
    return this.prisma.payee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.tin !== undefined ? { tin: dto.tin.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      select: { id: true, name: true, address: true, tin: true, isActive: true, version: true },
    });
  }

  /**
   * Merge one payee (the source) into another (the target survivor). The source
   * is deactivated and points to the survivor; blank fields on the survivor are
   * back-filled from the source so no detail is lost. Payees are never deleted.
   */
  async merge(orgId: string, userId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Choose a different payee to merge into.');
    }
    const [source, target] = await Promise.all([
      this.prisma.payee.findFirst({ where: { id: sourceId, organizationId: orgId } }),
      this.prisma.payee.findFirst({ where: { id: targetId, organizationId: orgId } }),
    ]);
    if (!source) throw new NotFoundException('Payee to merge was not found.');
    if (!target) throw new NotFoundException('Target payee was not found.');
    if (source.mergedIntoId) throw new BadRequestException('That payee was already merged.');
    if (target.mergedIntoId) {
      throw new BadRequestException('Cannot merge into a payee that was itself merged away.');
    }

    await this.prisma.$transaction([
      // Back-fill missing detail on the survivor.
      this.prisma.payee.update({
        where: { id: targetId },
        data: {
          address: target.address ?? source.address,
          tin: target.tin ?? source.tin,
          updatedBy: userId,
          version: { increment: 1 },
        },
      }),
      // Retire the absorbed payee.
      this.prisma.payee.update({
        where: { id: sourceId },
        data: {
          isActive: false,
          mergedIntoId: targetId,
          updatedBy: userId,
          version: { increment: 1 },
        },
      }),
    ]);

    const survivor = await this.prisma.payee.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, address: true, tin: true, isActive: true, version: true },
    });
    return survivor;
  }
}
