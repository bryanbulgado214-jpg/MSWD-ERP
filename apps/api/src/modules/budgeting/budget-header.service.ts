import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BudgetHeader } from '@prisma/client';

import { getGrantedPermissionCodes } from '../../common/guards/get-granted-permission-codes';
import type { PaginatedResult } from '../../common/types/paginated-result';
import { PrismaService } from '../../database/prisma.service';
import { runAudited } from './audit-actor.util';
import { BudgetValidation } from './budget-validation';
import type { CreateBudgetHeaderDto, ListBudgetHeadersQueryDto, UpdateBudgetHeaderDto } from './dto/budget-header.dto';

/** What the list endpoint actually returns per row — the raw
 * BudgetHeader plus the two related names a caller needs to search/
 * display by, so the frontend never has to make N+1 follow-up requests
 * just to show "Finance Division" instead of a bare UUID. */
export type BudgetHeaderListItem = BudgetHeader & {
  responsibilityCenter: { name: string; code: string };
  fundSource: { name: string; code: string };
};

@Injectable()
export class BudgetHeaderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateBudgetHeaderDto, actorUserId?: string): Promise<BudgetHeader> {
    const amount = new Prisma.Decimal(dto.totalAmount);
    BudgetValidation.assertNonNegative(amount, 'totalAmount');
    BudgetValidation.assertFixedPrecision(amount, 'totalAmount');

    // Every referenced record must belong to the SAME organization as
    // the caller — FK constraints alone only guarantee the record
    // exists *somewhere*, not that it's this organization's. Without
    // this, a header could be created referencing another
    // organization's version/responsibility-center/fund-source.
    await this.requireSameOrganization(organizationId, dto);

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetHeader.create({
        data: {
          organizationId,
          budgetVersionId: dto.budgetVersionId,
          responsibilityCenterId: dto.responsibilityCenterId,
          fundSourceId: dto.fundSourceId,
          currencyCode: dto.currencyCode ?? 'PHP',
          totalAmount: amount,
          createdBy: actorUserId ?? null,
        },
      }),
    );
  }

  /**
   * Search + filter + paginate + sort budget headers within an
   * organization. `search` matches against the linked responsibility
   * center's or fund source's name (case-insensitive substring) —
   * budget_headers itself has no free-text column of its own worth
   * searching.
   */
  async findAllPaginated(
    organizationId: string,
    query: ListBudgetHeadersQueryDto,
  ): Promise<PaginatedResult<BudgetHeaderListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.BudgetHeaderWhereInput = {
      organizationId,
      ...(query.budgetVersionId ? { budgetVersionId: query.budgetVersionId } : {}),
      ...(query.responsibilityCenterId ? { responsibilityCenterId: query.responsibilityCenterId } : {}),
      ...(query.fundSourceId ? { fundSourceId: query.fundSourceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { responsibilityCenter: { name: { contains: query.search, mode: 'insensitive' } } },
              { fundSource: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.budgetHeader.findMany({
        where,
        include: {
          responsibilityCenter: { select: { name: true, code: true } },
          fundSource: { select: { name: true, code: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.budgetHeader.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(organizationId: string, id: string): Promise<BudgetHeaderListItem> {
    const header = await this.prisma.budgetHeader.findFirst({
      where: { id, organizationId },
      include: {
        responsibilityCenter: { select: { name: true, code: true } },
        fundSource: { select: { name: true, code: true } },
      },
    });
    if (!header) {
      throw new NotFoundException(`Budget header ${id} not found.`);
    }
    return header;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateBudgetHeaderDto,
    actorUserId?: string,
  ): Promise<BudgetHeader> {
    const current = await this.findOne(organizationId, id);

    // "Only users with approval authority may approve or return
    // budgets" (Budget Approval workflow) — this endpoint is still the
    // one, existing generic status-setter (no new endpoint), but
    // approving (-> approved) and returning a submitted budget for
    // revision (submitted -> draft) specifically require a SEPARATE
    // permission from ordinary create/edit/submit
    // (`budgeting.header.manage`). Every other status value/transition
    // through this same method is unaffected.
    const isApproveTransition = dto.status === 'approved';
    const isReturnTransition = dto.status === 'draft' && current.status === 'submitted';
    if (isApproveTransition || isReturnTransition) {
      if (!actorUserId) {
        throw new ForbiddenException('Missing required permission(s): budgeting.header.approve');
      }
      const granted = await getGrantedPermissionCodes(this.prisma, actorUserId);
      if (!granted.has('budgeting.header.approve')) {
        throw new ForbiddenException('Missing required permission(s): budgeting.header.approve');
      }
    }

    let amount: Prisma.Decimal | undefined;
    if (dto.totalAmount !== undefined) {
      amount = new Prisma.Decimal(dto.totalAmount);
      BudgetValidation.assertNonNegative(amount, 'totalAmount');
      BudgetValidation.assertFixedPrecision(amount, 'totalAmount');
    }

    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.budgetHeader.update({
        where: { id },
        data: {
          ...(amount !== undefined ? { totalAmount: amount } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedBy: actorUserId ?? null,
          version: { increment: 1 },
        },
      }),
    );
  }

  private async requireSameOrganization(organizationId: string, dto: CreateBudgetHeaderDto): Promise<void> {
    const [version, responsibilityCenter, fundSource] = await Promise.all([
      this.prisma.budgetVersion.findFirst({
        where: { id: dto.budgetVersionId, budgetCycle: { organizationId } },
        select: { id: true },
      }),
      this.prisma.responsibilityCenter.findFirst({
        where: { id: dto.responsibilityCenterId, organizationId },
        select: { id: true },
      }),
      this.prisma.fundSource.findFirst({
        where: { id: dto.fundSourceId, organizationId },
        select: { id: true },
      }),
    ]);

    if (!version) throw new NotFoundException(`Budget version ${dto.budgetVersionId} not found.`);
    if (!responsibilityCenter) throw new NotFoundException(`Responsibility center ${dto.responsibilityCenterId} not found.`);
    if (!fundSource) throw new NotFoundException(`Fund source ${dto.fundSourceId} not found.`);
  }
}
