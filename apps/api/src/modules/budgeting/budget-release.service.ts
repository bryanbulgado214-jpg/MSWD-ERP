import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from './audit-actor.util';
import { BudgetValidation } from './budget-validation';
import type { CreateReleaseInput } from './budget-release.types';

/**
 * Deliberately minimal: this is the ONE action that creates/releases a
 * budget_release, added specifically so "releases" is a real, loggable
 * audit event with a genuine actor — before this, budget_releases rows
 * only ever came from seed data or ad-hoc SQL, with no application code
 * path (and therefore nothing to attribute an audit entry to). Anything
 * beyond this single action (editing a release, un-releasing it, etc.)
 * is out of scope here — this file exists to serve the audit-logging
 * task, not to be a full release-management service.
 *
 * TWO NARROW ADDITIONS made specifically for the Budget Release
 * workflow task (mirroring the same precedent as the Budget Approval
 * workflow's permission check — a small, explicitly-requested guard
 * inside an existing method, not a new endpoint/table/service):
 *   1. "Only Approved budgets may receive budget releases" — the
 *      header's status is now checked before allowing a release.
 *   2. "Prevent releasing a total greater than the approved budget" —
 *      the sum of every existing release against this header plus the
 *      new amount must not exceed the header's totalAmount. This reuses
 *      BudgetValidation.assertResultNotNegative (already used
 *      identically in reservation.service.ts) rather than introducing
 *      a new validation rule shape.
 *
 * Both checks — and the release insert itself — now run inside ONE
 * transaction that row-locks the budget_header first
 * (`SELECT ... FOR UPDATE`), the exact same locking pattern already
 * established in reservation.service.ts's submit() method, so two
 * concurrent releases against the SAME header can never both read the
 * same "remaining approved budget" and both proceed — the second one
 * blocks until the first commits, then sees the updated total.
 *
 * GENUINE GAPS NOT ADDRESSED HERE, since fixing them would mean adding
 * new capability rather than a narrow guard clause (see this task's
 * final report for the full, honest list): there is no Draft/Posted
 * lifecycle for releases at all (status is set to `released`
 * immediately, and there is no edit/delete/post method anywhere); there
 * is no per-account-code "release lines" concept in this schema at all
 * (a release is one lump sum against the whole header); there is no
 * remarks column; and there is no separate "post/finalize" permission
 * distinct from `budgeting.release.create`.
 */
@Injectable()
export class BudgetReleaseService {
  constructor(private readonly prisma: PrismaService) {}

  async release(organizationId: string, input: CreateReleaseInput) {
    const amount = new Prisma.Decimal(input.releasedAmount);
    BudgetValidation.assertPositive(amount, 'releasedAmount');
    BudgetValidation.assertFixedPrecision(amount, 'releasedAmount');

    return runAudited(this.prisma, input.createdBy, async (tx) => {
      const headerRows = await tx.$queryRaw<
        { id: string; organization_id: string; status: string; total_amount: string }[]
      >(Prisma.sql`
        SELECT id, organization_id, status, total_amount
        FROM budget_headers
        WHERE id = ${input.budgetHeaderId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `);
      const header = headerRows[0];
      if (!header) {
        throw new NotFoundException(`Budget header ${input.budgetHeaderId} not found.`);
      }

      // "Only Approved budgets may receive budget releases. Do not
      // allow releases against Draft, Submitted, Returned, or inactive
      // budgets." — the ONLY status this schema actually has for "not
      // yet approved" is `draft` (what "Returned" maps to — see the
      // Budget Approval workflow's own notes on this), so this check
      // covers every non-approved status by construction.
      if (header.status !== 'approved') {
        throw new BadRequestException(
          `Cannot release funds against a budget that is "${header.status}" (only "approved" budgets can receive releases).`,
        );
      }

      const existingSumRows = await tx.$queryRaw<{ total: string | null }[]>(Prisma.sql`
        SELECT SUM(released_amount) AS total FROM budget_releases WHERE budget_header_id = ${input.budgetHeaderId}::uuid
      `);
      const alreadyReleased = new Prisma.Decimal(existingSumRows[0]?.total ?? 0);
      const totalApproved = new Prisma.Decimal(header.total_amount);

      // "Prevent releasing a total greater than the approved budget."
      const remainingAfterThisRelease = totalApproved.minus(alreadyReleased).minus(amount);
      BudgetValidation.assertResultNotNegative(remainingAfterThisRelease, 'remaining approved budget');

      return tx.budgetRelease.create({
        data: {
          organizationId: header.organization_id,
          budgetHeaderId: input.budgetHeaderId,
          releaseNumber: input.releaseNumber,
          releaseDate: input.releaseDate,
          releasedAmount: amount,
          status: 'released',
          createdBy: input.createdBy ?? null,
        },
      });
    });
  }

  async findAllForHeader(organizationId: string, budgetHeaderId: string) {
    return this.prisma.budgetRelease.findMany({
      where: { budgetHeaderId, organizationId },
      orderBy: { releaseDate: 'asc' },
    });
  }

  async findAllForOrg(organizationId: string, status?: string) {
    return this.prisma.budgetRelease.findMany({
      where: {
        organizationId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        budgetHeader: {
          select: {
            id: true,
            responsibilityCenter: { select: { code: true, name: true } },
            fundSource: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { releaseDate: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const release = await this.prisma.budgetRelease.findFirst({ where: { id, organizationId } });
    if (!release) {
      throw new NotFoundException(`Budget release ${id} not found.`);
    }
    return release;
  }
}
