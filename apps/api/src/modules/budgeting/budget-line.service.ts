import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BudgetLine } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from './audit-actor.util';
import { BudgetValidation } from './budget-validation';
import type { CreateBudgetLineDto, UpdateBudgetLineDto } from './dto/budget-line.dto';

/**
 * budget_lines has no organization_id column of its own (scoped through
 * budget_headers) — every method here filters via that relation rather
 * than trusting a bare `id`, so a caller from one organization can never
 * read or write another organization's line by guessing a UUID (this was
 * previously missing — see docs/Modules/Budgeting-Phase1.md review notes).
 */
@Injectable()
export class BudgetLineService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateBudgetLineDto, actorUserId?: string): Promise<BudgetLine> {
    const amount = new Prisma.Decimal(dto.amount);
    BudgetValidation.assertNonNegative(amount, 'amount');
    BudgetValidation.assertFixedPrecision(amount, 'amount');

    await this.requireHeaderInOrganization(organizationId, dto.budgetHeaderId);

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetLine.create({
        data: {
          budgetHeaderId: dto.budgetHeaderId,
          accountCode: dto.accountCode,
          description: dto.description ?? null,
          amount,
          createdBy: actorUserId ?? null,
        },
      }),
    );
  }

  async findAllForHeader(organizationId: string, budgetHeaderId: string): Promise<BudgetLine[]> {
    await this.requireHeaderInOrganization(organizationId, budgetHeaderId);
    return this.prisma.budgetLine.findMany({
      where: { budgetHeaderId },
      orderBy: { accountCode: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string): Promise<BudgetLine> {
    const line = await this.prisma.budgetLine.findFirst({
      where: { id, budgetHeader: { organizationId } },
    });
    if (!line) {
      throw new NotFoundException(`Budget line ${id} not found.`);
    }
    return line;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateBudgetLineDto,
    actorUserId?: string,
  ): Promise<BudgetLine> {
    await this.findOne(organizationId, id); // 404s if missing or wrong org

    let amount: Prisma.Decimal | undefined;
    if (dto.amount !== undefined) {
      amount = new Prisma.Decimal(dto.amount);
      BudgetValidation.assertNonNegative(amount, 'amount');
      BudgetValidation.assertFixedPrecision(amount, 'amount');
    }

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetLine.update({
        where: { id },
        data: {
          ...(dto.accountCode !== undefined ? { accountCode: dto.accountCode } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(amount !== undefined ? { amount } : {}),
          updatedBy: actorUserId ?? null,
        },
      }),
    );
  }

  async remove(organizationId: string, id: string): Promise<void> {
    // budget_lines -> budget_headers is the one CASCADE relationship in
    // this schema (lines have no independent existence) — but deleting a
    // line directly is still only sensible while its header is still
    // `draft`; enforce that here rather than relying on a DB-level rule
    // that doesn't exist for this specific case.
    const line = await this.prisma.budgetLine.findFirst({
      where: { id, budgetHeader: { organizationId } },
      include: { budgetHeader: true },
    });
    if (!line) {
      throw new NotFoundException(`Budget line ${id} not found.`);
    }
    if (line.budgetHeader.status !== 'draft') {
      throw new BadRequestException(
        `Cannot delete a line under a budget header that is "${line.budgetHeader.status}" (only "draft" allows line deletion).`,
      );
    }
    await this.prisma.budgetLine.delete({ where: { id } });
  }

  /** Shared by create/findAllForHeader — confirms the referenced header
   * actually belongs to the caller's organization before doing anything
   * with it. */
  private async requireHeaderInOrganization(organizationId: string, budgetHeaderId: string): Promise<void> {
    const header = await this.prisma.budgetHeader.findFirst({ where: { id: budgetHeaderId, organizationId } });
    if (!header) {
      throw new NotFoundException(`Budget header ${budgetHeaderId} not found.`);
    }
  }
}
