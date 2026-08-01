import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DisposalMethod, PropertyCondition } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const DISPOSAL_SELECT = {
  id: true,
  requestNumber: true,
  requestDate: true,
  status: true,
  disposalMethod: true,
  totalAppraised: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  requester: { select: { username: true } },
  appraiser: { select: { username: true } },
  approver: { select: { username: true } },
  creator: { select: { username: true } },
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unitOfMeasure: true,
      condition: true,
      appraisedValue: true,
      remarks: true,
      propertyRecord: {
        select: { id: true, propertyNumber: true, description: true, acquisitionCost: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class DisposalRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { status?: string }) {
    return this.prisma.disposalRequest.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      select: {
        id: true,
        requestNumber: true,
        requestDate: true,
        status: true,
        disposalMethod: true,
        totalAppraised: true,
        createdAt: true,
        requester: { select: { username: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
      select: DISPOSAL_SELECT,
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    return request;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      requestDate: string;
      remarks?: string;
      items: Array<{
        propertyRecordId: string;
        description: string;
        quantity: number;
        unitOfMeasure: string;
        condition: string;
        remarks?: string;
      }>;
    },
  ) {
    return runAudited(this.prisma, userId, async (tx) => {
      const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
        UPDATE document_sequences
        SET next_number = next_number + 1, last_generated_at = NOW()
        WHERE organization_id = ${organizationId}::uuid
          AND document_type = 'wmr'
        RETURNING next_number
      `;
      const requestNumber = `WMR-${String(seq.next_number).padStart(6, '0')}`;

      const itemsData = data.items.map((item) => ({
        propertyRecordId: item.propertyRecordId,
        description: item.description,
        quantity: item.quantity,
        unitOfMeasure: item.unitOfMeasure,
        condition: item.condition as PropertyCondition,
        ...(item.remarks ? { remarks: item.remarks } : {}),
      }));

      return tx.disposalRequest.create({
        data: {
          organizationId,
          requestNumber,
          requestDate: new Date(data.requestDate),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          requestedBy: userId,
          createdBy: userId,
          updatedBy: userId,
          items: { createMany: { data: itemsData } },
        },
        select: DISPOSAL_SELECT,
      });
    });
  }

  async submitForAppraisal(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    if (request.status !== 'draft') throw new BadRequestException('Only draft requests can be submitted for appraisal.');
    if (request.version !== expectedVersion) {
      throw new ConflictException('Request was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.disposalRequest.update({
        where: { id },
        data: { status: 'for_appraisal', updatedBy: userId, version: { increment: 1 } },
        select: DISPOSAL_SELECT,
      }),
    );
  }

  async appraise(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
    disposalMethod: string | undefined,
    items: Array<{ disposalItemId: string; appraisedValue: number }>,
  ) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    if (request.status !== 'for_appraisal') throw new BadRequestException('Only requests pending appraisal can be appraised.');
    if (request.version !== expectedVersion) {
      throw new ConflictException('Request was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      let totalAppraised = 0;
      for (const item of items) {
        await tx.disposalRequestItem.update({
          where: { id: item.disposalItemId },
          data: { appraisedValue: item.appraisedValue },
        });
        totalAppraised += item.appraisedValue;
      }

      return tx.disposalRequest.update({
        where: { id },
        data: {
          status: 'appraised',
          totalAppraised,
          ...(disposalMethod ? { disposalMethod: disposalMethod as DisposalMethod } : {}),
          appraisedBy: userId,
          appraisedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: DISPOSAL_SELECT,
      });
    });
  }

  async submitForApproval(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    if (request.status !== 'appraised') throw new BadRequestException('Only appraised requests can be submitted for approval.');
    if (request.version !== expectedVersion) {
      throw new ConflictException('Request was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.disposalRequest.update({
        where: { id },
        data: { status: 'for_approval', updatedBy: userId, version: { increment: 1 } },
        select: DISPOSAL_SELECT,
      }),
    );
  }

  async approve(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    if (request.status !== 'for_approval') throw new BadRequestException('Only requests pending approval can be approved.');
    if (request.version !== expectedVersion) {
      throw new ConflictException('Request was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.disposalRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: DISPOSAL_SELECT,
      }),
    );
  }

  async dispose(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    if (request.status !== 'approved') throw new BadRequestException('Only approved requests can be disposed.');
    if (request.version !== expectedVersion) {
      throw new ConflictException('Request was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      for (const item of request.items) {
        await tx.propertyRecord.update({
          where: { id: item.propertyRecordId },
          data: {
            isDisposed: true,
            condition: 'beyond_repair',
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      return tx.disposalRequest.update({
        where: { id },
        data: {
          status: 'disposed',
          disposedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: DISPOSAL_SELECT,
      });
    });
  }

  async cancel(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const request = await this.prisma.disposalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Disposal request not found.');
    if (request.status === 'disposed' || request.status === 'cancelled') {
      throw new BadRequestException('Cannot cancel a disposed or already cancelled request.');
    }
    if (request.version !== expectedVersion) {
      throw new ConflictException('Request was modified. Please refresh and try again.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.disposalRequest.update({
        where: { id },
        data: { status: 'cancelled', updatedBy: userId, version: { increment: 1 } },
        select: DISPOSAL_SELECT,
      }),
    );
  }
}
