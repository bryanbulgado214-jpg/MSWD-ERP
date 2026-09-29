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
        ppmpItem: {
          select: {
            id: true,
            code: true,
            itemDescription: true,
            quantity: true,
            unitOfMeasure: true,
            estimatedTotalCost: true,
            scheduleQuarter: true,
            department: { select: { id: true, code: true, name: true } },
            assignedUser: { select: { id: true, username: true } },
          },
        },
        fiscalYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { appNumber: 'asc' },
    });
  }

  /**
   * Consolidate the Annual Procurement Plan: for every APPROVED PPMP item in the
   * fiscal year that is not yet on the APP, create an APP line (one per PPMP
   * item, so the APP lists each end-user office's planned procurements). Safe to
   * re-run — it only adds what is missing.
   */
  async consolidate(organizationId: string, fiscalYearId: string, actorUserId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId },
    });
    if (!fy) throw new BadRequestException('Fiscal year not found.');

    const approved = await this.prisma.ppmpItem.findMany({
      where: { organizationId, fiscalYearId, status: 'approved' },
      orderBy: { code: 'asc' },
    });

    const existingApp = await this.prisma.appItem.findMany({
      where: { organizationId, fiscalYearId },
      select: { ppmpItemId: true, appNumber: true },
    });
    const covered = new Set(existingApp.map((a) => a.ppmpItemId));
    const usedNumbers = new Set(existingApp.map((a) => a.appNumber));

    const toAdd = approved.filter((p) => !covered.has(p.id));
    const quarterToMonth: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };
    let seq = existingApp.length + 1;
    const genAppNumber = (): string => {
      let n: string;
      do {
        n = `APP-${fy.year}-${String(seq).padStart(3, '0')}`;
        seq++;
      } while (usedNumbers.has(n));
      usedNumbers.add(n);
      return n;
    };

    if (toAdd.length > 0) {
      await runAudited(this.prisma, actorUserId, async (tx) => {
        for (const p of toAdd) {
          await tx.appItem.create({
            data: {
              organizationId,
              fiscalYearId,
              ppmpItemId: p.id,
              appNumber: genAppNumber(),
              procurementProjectTitle: p.itemDescription,
              procurementCategory: p.procurementCategory,
              approvedBudget: p.estimatedTotalCost,
              procurementMode: p.modeOfProcurement ?? null,
              scheduleMonth:
                p.scheduleQuarter != null ? (quarterToMonth[p.scheduleQuarter] ?? null) : null,
              // PPMPs are the approved budget, so the APP lines they produce are
              // approved too (ready to be cited on a purchase request).
              status: 'approved',
              createdBy: actorUserId,
            },
          });
        }
      });
    }

    const grandTotal = approved.reduce(
      (sum, p) => sum.add(p.estimatedTotalCost),
      new Prisma.Decimal(0),
    );

    return {
      created: toAdd.length,
      alreadyInApp: covered.size,
      totalApprovedPpmp: approved.length,
      grandTotalBudget: grandTotal.toString(),
    };
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
