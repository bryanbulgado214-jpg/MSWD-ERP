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

// The shared supplier master lives in the accounting payee table — both the
// accountant (DVs) and procurement (POs) draw from it. We expose it read/write
// here so the purchase officer sees and extends the same list on the PO page.
const PAYEE_SELECT = {
  id: true,
  name: true,
  tin: true,
  address: true,
  vatRegistered: true,
  isActive: true,
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

  // The shared supplier master (accounting payee list), surfaced for procurement
  // so the New PO page offers exactly the suppliers the accountant already has.
  async listPayees(organizationId: string) {
    return this.prisma.payee.findMany({
      where: { organizationId, mergedIntoId: null, isActive: true },
      select: PAYEE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async createPayee(
    organizationId: string,
    userId: string,
    data: { name: string; tin?: string; address?: string; vatRegistered?: boolean },
  ) {
    const name = data.name.trim();
    if (!name) throw new ConflictException('Supplier name is required.');
    const existing = await this.prisma.payee.findFirst({
      where: { organizationId, mergedIntoId: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`"${name}" is already in the supplier list.`);
    return this.prisma.payee.create({
      data: {
        organizationId,
        name,
        ...(data.tin?.trim() ? { tin: data.tin.trim() } : {}),
        ...(data.address?.trim() ? { address: data.address.trim() } : {}),
        vatRegistered: data.vatRegistered ?? false,
        createdBy: userId,
        updatedBy: userId,
      },
      select: PAYEE_SELECT,
    });
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
