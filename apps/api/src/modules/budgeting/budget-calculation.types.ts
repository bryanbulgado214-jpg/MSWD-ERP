import type { Prisma } from '@prisma/client';

/**
 * The six budget amounts this service computes for a given scope (a
 * single budget_release, or an entire budget_header aggregated across
 * all of its releases).
 *
 * All values are `Prisma.Decimal` (backed by decimal.js), never plain
 * JavaScript numbers — this project never performs money arithmetic in
 * floating point (see docs/04_Database's naming/precision standards:
 * every monetary column is `numeric(18,2)`).
 */
export interface BudgetAmountSummary {
  /** The approved budget ceiling — budget_headers.total_amount. */
  approvedAmount: Prisma.Decimal;

  /** Sum of released_amount across every release in scope. */
  releasedAmount: Prisma.Decimal;

  /**
   * Sum of each release's currently-maintained `reserved_amount` column
   * — the fast, authoritative reading of "what's currently held."
   */
  reservedAmount: Prisma.Decimal;

  /**
   * Independently re-derived from `budget_transaction_logs` (summing
   * `signed_amount` for reservation / reservation_release /
   * reservation_cancellation / adjustment entries) rather than read
   * directly from `budget_releases.reserved_amount`. In a correctly
   * functioning system this equals `reservedAmount` exactly — computing
   * it a second, independent way turns any mismatch into a visible data
   * integrity signal (`isConsistent`, below) instead of silently
   * trusting one stored column.
   */
  obligatedAmount: Prisma.Decimal;

  /**
   * Amount actually disbursed/spent. Always 0 in the current schema —
   * no Accounting/disbursement module exists yet to record real
   * utilization. This field exists so callers don't need to change once
   * that data source exists; wire it up when Accounting is built.
   */
  utilizedAmount: Prisma.Decimal;

  /**
   * `releasedAmount - obligatedAmount`. ALWAYS computed here, in code,
   * at call time — never read from a cached/stored value — so it can
   * never go stale relative to the other five numbers.
   */
  availableAmount: Prisma.Decimal;

  /**
   * True if `reservedAmount` and `obligatedAmount` agree. False signals
   * the release-level `reserved_amount` column and the transaction
   * ledger have drifted apart — worth investigating, not something this
   * service silently papers over.
   */
  isConsistent: boolean;
}
