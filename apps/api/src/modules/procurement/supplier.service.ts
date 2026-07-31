import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  tin: true,
  address: true,
  contactPerson: true,
  contactNumber: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, includeInactive = false) {
    return this.prisma.supplier.findMany({
      where: {
        organizationId,
        ...(!includeInactive ? { isActive: true } : {}),
      },
      select: SUPPLIER_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
      select: SUPPLIER_SELECT,
    });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    return supplier;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      name: string;
      tin?: string;
      address?: string;
      contactPerson?: string;
      contactNumber?: string;
      email?: string;
    },
  ) {
    const existing = await this.prisma.supplier.findFirst({
      where: { organizationId, name: data.name },
    });
    if (existing) throw new ConflictException('A supplier with this name already exists.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.supplier.create({
        data: {
          organizationId,
          name: data.name,
          ...(data.tin ? { tin: data.tin } : {}),
          ...(data.address ? { address: data.address } : {}),
          ...(data.contactPerson ? { contactPerson: data.contactPerson } : {}),
          ...(data.contactNumber ? { contactNumber: data.contactNumber } : {}),
          ...(data.email ? { email: data.email } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: SUPPLIER_SELECT,
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      name?: string;
      tin?: string;
      address?: string;
      contactPerson?: string;
      contactNumber?: string;
      email?: string;
      isActive?: boolean;
    },
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    if (supplier.version !== data.expectedVersion) {
      throw new ConflictException('Supplier was modified by another user. Please refresh and try again.');
    }

    if (data.name && data.name !== supplier.name) {
      const dup = await this.prisma.supplier.findFirst({
        where: { organizationId, name: data.name, id: { not: id } },
      });
      if (dup) throw new ConflictException('A supplier with this name already exists.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.supplier.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.tin !== undefined ? { tin: data.tin } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson } : {}),
          ...(data.contactNumber !== undefined ? { contactNumber: data.contactNumber } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: SUPPLIER_SELECT,
      }),
    );
  }
}
