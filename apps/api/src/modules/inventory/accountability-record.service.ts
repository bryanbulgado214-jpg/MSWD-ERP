import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccountabilityType } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const ACCOUNTABILITY_SELECT = {
  id: true,
  accountabilityType: true,
  accountabilityNumber: true,
  issuedDate: true,
  returnDate: true,
  status: true,
  parRenewalDate: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  issuedTo: { select: { id: true, username: true } },
  issuer: { select: { username: true } },
  creator: { select: { username: true } },
  items: {
    select: {
      id: true,
      quantity: true,
      unitCost: true,
      totalCost: true,
      remarks: true,
      propertyRecord: {
        select: {
          id: true,
          propertyNumber: true,
          description: true,
          serialNumber: true,
          condition: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class AccountabilityRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { type?: string; status?: string; issuedToUserId?: string },
  ) {
    return this.prisma.accountabilityRecord.findMany({
      where: {
        organizationId,
        ...(filters?.type ? { accountabilityType: filters.type as AccountabilityType } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.issuedToUserId ? { issuedToUserId: filters.issuedToUserId } : {}),
      },
      select: {
        id: true,
        accountabilityType: true,
        accountabilityNumber: true,
        issuedDate: true,
        status: true,
        createdAt: true,
        issuedTo: { select: { id: true, username: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.accountabilityRecord.findFirst({
      where: { id, organizationId },
      select: ACCOUNTABILITY_SELECT,
    });
    if (!record) throw new NotFoundException('Accountability record not found.');
    return record;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      accountabilityType: AccountabilityType;
      issuedToUserId: string;
      issuedDate: string;
      remarks?: string;
      items: Array<{ propertyRecordId: string; quantity: number; unitCost: number; remarks?: string }>;
    },
  ) {
    const docType = data.accountabilityType === 'par' ? 'par' : 'ics';

    return runAudited(this.prisma, userId, async (tx) => {
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = ${docType}
        RETURNING next_number
      `;
      const prefix = data.accountabilityType === 'par' ? 'PAR' : 'ICS';
      const accountabilityNumber = `${prefix}-${String(seq.next_number).padStart(6, '0')}`;

      const itemsData = data.items.map((item) => ({
        propertyRecordId: item.propertyRecordId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.quantity * item.unitCost,
        ...(item.remarks ? { remarks: item.remarks } : {}),
      }));

      const record = await tx.accountabilityRecord.create({
        data: {
          organizationId,
          accountabilityType: data.accountabilityType,
          accountabilityNumber,
          issuedToUserId: data.issuedToUserId,
          issuedDate: new Date(data.issuedDate),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          issuedBy: userId,
          createdBy: userId,
          updatedBy: userId,
          items: { createMany: { data: itemsData } },
        },
        select: ACCOUNTABILITY_SELECT,
      });

      for (const item of data.items) {
        await tx.propertyRecord.update({
          where: { id: item.propertyRecordId },
          data: {
            accountableUserId: data.issuedToUserId,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      return record;
    });
  }

  async returnItems(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
    returnDate: string,
  ) {
    const record = await this.prisma.accountabilityRecord.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!record) throw new NotFoundException('Accountability record not found.');
    if (record.status !== 'active') throw new BadRequestException('Only active records can be returned.');
    if (record.version !== expectedVersion) {
      throw new ConflictException('Record was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      for (const item of record.items) {
        await tx.propertyRecord.update({
          where: { id: item.propertyRecordId },
          data: {
            accountableUserId: null,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      return tx.accountabilityRecord.update({
        where: { id },
        data: {
          status: 'returned',
          returnDate: new Date(returnDate),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ACCOUNTABILITY_SELECT,
      });
    });
  }

  async transfer(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
    newUserId: string,
  ) {
    const record = await this.prisma.accountabilityRecord.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!record) throw new NotFoundException('Accountability record not found.');
    if (record.status !== 'active') throw new BadRequestException('Only active records can be transferred.');
    if (record.version !== expectedVersion) {
      throw new ConflictException('Record was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      for (const item of record.items) {
        await tx.propertyRecord.update({
          where: { id: item.propertyRecordId },
          data: {
            accountableUserId: newUserId,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      const updated = await tx.accountabilityRecord.update({
        where: { id },
        data: {
          status: 'transferred',
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: ACCOUNTABILITY_SELECT,
      });

      const docType = record.accountabilityType === 'par' ? 'par' : 'ics';
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = ${docType}
        RETURNING next_number
      `;
      const prefix = record.accountabilityType === 'par' ? 'PAR' : 'ICS';
      const newNumber = `${prefix}-${String(seq.next_number).padStart(6, '0')}`;

      const newItems = record.items.map((item) => ({
        propertyRecordId: item.propertyRecordId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
      }));

      await tx.accountabilityRecord.create({
        data: {
          organizationId,
          accountabilityType: record.accountabilityType,
          accountabilityNumber: newNumber,
          issuedToUserId: newUserId,
          issuedDate: new Date(),
          remarks: `Transfer from ${record.accountabilityNumber}`,
          issuedBy: userId,
          createdBy: userId,
          updatedBy: userId,
          items: { createMany: { data: newItems } },
        },
      });

      return updated;
    });
  }
}
