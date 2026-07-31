import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

export interface CreateAppItemInput {
  fiscalYearId: string;
  ppmpItemId: string;
  appNumber: string;
  procurementProjectTitle: string;
  procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  approvedBudget: number | string;
  procurementMode?: string;
  scheduleMonth?: number;
  createdBy?: string;
}

@Injectable()
export class AppItemService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreateAppItemInput) {
    const ppmpItem = await this.prisma.ppmpItem.findFirst({
      where: { id: input.ppmpItemId, organizationId, status: 'approved' },
    });
    if (!ppmpItem) {
      throw new BadRequestException('APP item must reference an approved PPMP item.');
    }

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.appItem.create({
        data: {
          organizationId,
          fiscalYearId: input.fiscalYearId,
          ppmpItemId: input.ppmpItemId,
          appNumber: input.appNumber,
          procurementProjectTitle: input.procurementProjectTitle,
          procurementCategory: input.procurementCategory,
          approvedBudget: new Prisma.Decimal(input.approvedBudget),
          procurementMode: input.procurementMode ?? null,
          scheduleMonth: input.scheduleMonth ?? null,
          createdBy: input.createdBy ?? null,
        },
      }),
    );
  }

  async findAll(organizationId: string, filters?: { fiscalYearId?: string; status?: string }) {
    return this.prisma.appItem.findMany({
      where: {
        organizationId,
        ...(filters?.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
        ...(filters?.status ? { status: filters.status as 'draft' | 'approved' | 'cancelled' } : {}),
      },
      include: {
        ppmpItem: { select: { id: true, code: true, itemDescription: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.appItem.findFirst({
      where: { id, organizationId },
      include: {
        ppmpItem: { select: { id: true, code: true, itemDescription: true, estimatedTotalCost: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
        purchaseRequests: { select: { id: true, prNumber: true, totalAmount: true, status: true } },
      },
    });
    if (!item) throw new NotFoundException(`APP item ${id} not found.`);
    return item;
  }

  async approve(organizationId: string, id: string, actorUserId: string) {
    const item = await this.prisma.appItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(`APP item ${id} not found.`);
    if (item.status !== 'draft') {
      throw new BadRequestException(`APP item is "${item.status}" and cannot be approved.`);
    }
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.appItem.update({
        where: { id },
        data: { status: 'approved' },
      }),
    );
  }
}
