import { Injectable, NotFoundException } from '@nestjs/common';
import type { BudgetCycle } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from './audit-actor.util';
import type { CreateBudgetCycleDto, UpdateBudgetCycleDto } from './dto/budget-cycle.dto';

/**
 * Deliberately simple CRUD — no approval workflow, no cross-field
 * business rules beyond what the database itself enforces (unique code
 * per organization, valid fiscal_year_id FK). This is the management
 * layer for the cycle "container" a budget lives under; the actual
 * budget-amount rules (available balance, no negative balances, etc.)
 * live further down the chain in BudgetValidation/ReservationService.
 */
@Injectable()
export class BudgetCycleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateBudgetCycleDto, actorUserId?: string): Promise<BudgetCycle> {
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetCycle.create({
        data: {
          organizationId,
          fiscalYearId: dto.fiscalYearId,
          code: dto.code,
          name: dto.name,
          createdBy: actorUserId ?? null,
        },
      }),
    );
  }

  async findAll(organizationId: string): Promise<BudgetCycle[]> {
    return this.prisma.budgetCycle.findMany({ where: { organizationId }, orderBy: { code: 'asc' } });
  }

  async findOne(organizationId: string, id: string): Promise<BudgetCycle> {
    const cycle = await this.prisma.budgetCycle.findFirst({ where: { id, organizationId } });
    if (!cycle) {
      throw new NotFoundException(`Budget cycle ${id} not found.`);
    }
    return cycle;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateBudgetCycleDto,
    actorUserId?: string,
  ): Promise<BudgetCycle> {
    await this.findOne(organizationId, id); // 404s if missing or wrong org

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetCycle.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedBy: actorUserId ?? null,
          version: { increment: 1 },
        },
      }),
    );
  }
}
