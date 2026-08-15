import { Injectable, NotFoundException } from '@nestjs/common';
import type { BudgetVersion } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { runAudited } from './audit-actor.util';
import { CreateBudgetVersionDto, UpdateBudgetVersionDto } from './dto/budget-version.dto';

/**
 * budget_versions has no organization_id column of its own (scoped
 * through budget_cycles) — every method here filters via that relation
 * rather than trusting a bare `id`, so a caller from one organization
 * can never read or write another organization's version by guessing a
 * UUID (this was previously missing — see docs/Modules/Budgeting-Phase1.md
 * review notes).
 */
@Injectable()
export class BudgetVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    dto: CreateBudgetVersionDto,
    actorUserId?: string,
  ): Promise<BudgetVersion> {
    await this.requireCycleInOrganization(organizationId, dto.budgetCycleId);

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetVersion.create({
        data: {
          budgetCycleId: dto.budgetCycleId,
          versionNumber: dto.versionNumber,
          name: dto.name,
          createdBy: actorUserId ?? null,
        },
      }),
    );
  }

  async findAllForCycle(organizationId: string, budgetCycleId: string): Promise<BudgetVersion[]> {
    await this.requireCycleInOrganization(organizationId, budgetCycleId);
    return this.prisma.budgetVersion.findMany({
      where: { budgetCycleId },
      orderBy: { versionNumber: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string): Promise<BudgetVersion> {
    const version = await this.prisma.budgetVersion.findFirst({
      where: { id, budgetCycle: { organizationId } },
    });
    if (!version) {
      throw new NotFoundException(`Budget version ${id} not found.`);
    }
    return version;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateBudgetVersionDto,
    actorUserId?: string,
  ): Promise<BudgetVersion> {
    await this.findOne(organizationId, id); // 404s if missing or wrong org

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetVersion.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.isCurrent !== undefined ? { isCurrent: dto.isCurrent } : {}),
          updatedBy: actorUserId ?? null,
          version: { increment: 1 },
        },
      }),
    );
  }

  /** Shared by create/findAllForCycle — confirms the referenced cycle
   * actually belongs to the caller's organization before doing anything
   * with it. */
  private async requireCycleInOrganization(
    organizationId: string,
    budgetCycleId: string,
  ): Promise<void> {
    const cycle = await this.prisma.budgetCycle.findFirst({
      where: { id: budgetCycleId, organizationId },
    });
    if (!cycle) {
      throw new NotFoundException(`Budget cycle ${budgetCycleId} not found.`);
    }
  }
}
