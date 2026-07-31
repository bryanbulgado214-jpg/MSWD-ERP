import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BudgetTransactionType } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { BudgetAmountSummary } from './budget-calculation.types';

const ZERO = new Prisma.Decimal(0);

/**
 * Transaction types that represent a change to how much of a release is
 * currently held/committed (as opposed to, say, a pure informational
 * entry). Summing `signed_amount` across these re-derives "obligated"
 * independently of `budget_releases.reserved_amount`.
 */
const OBLIGATION_TRANSACTION_TYPES: BudgetTransactionType[] = [
  'reservation',
  'reservation_release',
  'reservation_cancellation',
  'adjustment',
];

/**
 * Read-only budget calculation service.
 *
 * Computes the six standard budget amounts — approved, released,
 * reserved, obligated, utilized, available — for either a single
 * `budget_release` or an entire `budget_header` (aggregated across all
 * of its releases).
 *
 * This service deliberately contains NO reservation logic: no method
 * here creates, approves, cancels, or otherwise mutates a
 * `budget_reservation` or `budget_release` row. Every method is a pure
 * read + calculation. Row-locking / concurrency-safe mutation (per
 * docs/04_Database §12) belongs in a future, separate service.
 */
@Injectable()
export class BudgetCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Amount summary for a single budget release.
   *
   * SECURITY FIX (Budgeting Module Audit): this method previously took
   * no organizationId and queried by `id` alone via `findUnique` — any
   * authenticated user with `budgeting.read` in ANY organization could
   * read ANY OTHER organization's release summary just by knowing a
   * valid UUID. Verified this was genuinely exploitable against real
   * data before fixing. Now scoped exactly like every other budgeting
   * service method (e.g. BudgetHeaderService.findOne). */
  async getReleaseSummary(organizationId: string, budgetReleaseId: string): Promise<BudgetAmountSummary> {
    const release = await this.prisma.budgetRelease.findFirst({
      where: { id: budgetReleaseId, organizationId },
      include: { budgetHeader: true },
    });
    if (!release) {
      throw new NotFoundException(`Budget release ${budgetReleaseId} not found.`);
    }

    const obligatedAmount = await this.sumLedgerAmount([release.id]);

    return this.buildSummary({
      approvedAmount: release.budgetHeader.totalAmount,
      releasedAmount: release.releasedAmount,
      reservedAmount: release.reservedAmount,
      obligatedAmount,
    });
  }

  /** Amount summary aggregated across every release under a budget
   * header. Same organization-scoping fix as getReleaseSummary above —
   * see that method's doc comment. */
  async getHeaderSummary(organizationId: string, budgetHeaderId: string): Promise<BudgetAmountSummary> {
    const header = await this.prisma.budgetHeader.findFirst({
      where: { id: budgetHeaderId, organizationId },
      include: { budgetReleases: true },
    });
    if (!header) {
      throw new NotFoundException(`Budget header ${budgetHeaderId} not found.`);
    }

    const releasedAmount = header.budgetReleases.reduce(
      (sum, r) => sum.plus(r.releasedAmount),
      ZERO,
    );
    const reservedAmount = header.budgetReleases.reduce(
      (sum, r) => sum.plus(r.reservedAmount),
      ZERO,
    );
    const obligatedAmount = await this.sumLedgerAmount(header.budgetReleases.map((r) => r.id));

    return this.buildSummary({
      approvedAmount: header.totalAmount,
      releasedAmount,
      reservedAmount,
      obligatedAmount,
    });
  }

  /**
   * Re-derives "obligated" independently from the append-only ledger,
   * rather than trusting `budget_releases.reserved_amount` directly —
   * see `BudgetAmountSummary.obligatedAmount`'s doc comment for why.
   * Returns 0 for an empty release list rather than querying with an
   * empty `IN ()`, which some drivers handle inconsistently.
   */
  private async sumLedgerAmount(budgetReleaseIds: string[]): Promise<Prisma.Decimal> {
    if (budgetReleaseIds.length === 0) return ZERO;

    const result = await this.prisma.budgetTransactionLog.aggregate({
      where: {
        budgetReleaseId: { in: budgetReleaseIds },
        transactionType: { in: OBLIGATION_TRANSACTION_TYPES },
      },
      _sum: { signedAmount: true },
    });

    return result._sum.signedAmount ?? ZERO;
  }

  private buildSummary(input: {
    approvedAmount: Prisma.Decimal;
    releasedAmount: Prisma.Decimal;
    reservedAmount: Prisma.Decimal;
    obligatedAmount: Prisma.Decimal;
  }): BudgetAmountSummary {
    const { approvedAmount, releasedAmount, reservedAmount, obligatedAmount } = input;

    // Utilized amount has no data source yet in the current schema (no
    // Accounting/disbursement module exists). Always 0 until that module
    // provides real figures — see the field's doc comment.
    const utilizedAmount = ZERO;

    // Available balance is ALWAYS calculated here, never read from a
    // stored value, so it can never go stale relative to the inputs
    // above.
    const availableAmount = releasedAmount.minus(obligatedAmount);

    const isConsistent = reservedAmount.equals(obligatedAmount);

    return {
      approvedAmount,
      releasedAmount,
      reservedAmount,
      obligatedAmount,
      utilizedAmount,
      availableAmount,
      isConsistent,
    };
  }
}
