import { BadRequestException } from '@nestjs/common';
import { Prisma, type BudgetReleaseStatus } from '@prisma/client';

/**
 * Reusable, stateless server-side validation rules for Budgeting
 * amounts and release state. Every rule throws a NestJS
 * `BadRequestException` with a clear message on failure — callers don't
 * duplicate error handling. No database access happens here; callers
 * pass in whatever data they already have (typically already read
 * inside a transaction that holds the relevant row lock).
 *
 * Not a NestJS-injectable service on purpose — these are pure functions
 * with no dependencies, so a plain class with static methods is simpler
 * to call from anywhere (services, and later controllers/other modules)
 * without needing DI just to validate a number.
 */
export class BudgetValidation {
  /**
   * Money in this system is always `numeric(18,2)` (docs/04_Database
   * §2/§5: fixed-precision decimal, never floating point). Reject
   * anything with more than 2 decimal places rather than silently
   * rounding/truncating it — a caller passing 100.999 almost certainly
   * has a bug upstream, and silently coercing it hides that.
   */
  static assertFixedPrecision(amount: Prisma.Decimal, label = 'amount'): void {
    if (amount.decimalPlaces() > 2) {
      throw new BadRequestException(
        `${label} must have at most 2 decimal places (got ${amount.toString()}).`,
      );
    }
  }

  static assertPositive(amount: Prisma.Decimal, label = 'amount'): void {
    if (amount.lte(0)) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
  }

  static assertNonNegative(amount: Prisma.Decimal, label = 'amount'): void {
    if (amount.lt(0)) {
      throw new BadRequestException(`${label} cannot be negative.`);
    }
  }

  /**
   * "Released budget required" — a reservation may only be committed
   * (submitted) against a release that has actually been released.
   * Reserving against one still in `draft` (never formally released) or
   * `cancelled` would create a commitment with no real budget behind it.
   */
  static assertReleaseIsReleased(status: BudgetReleaseStatus): void {
    if (status !== 'released') {
      throw new BadRequestException(
        `Budget release must be in "released" status before it can be reserved against (currently "${status}").`,
      );
    }
  }

  /** "Cannot reserve beyond available budget." */
  static assertWithinAvailableBudget(
    availableAmount: Prisma.Decimal,
    requestedAmount: Prisma.Decimal,
  ): void {
    if (availableAmount.lt(requestedAmount)) {
      throw new BadRequestException(
        `Insufficient budget: available ${availableAmount.toFixed(2)}, requested ${requestedAmount.toFixed(2)}.`,
      );
    }
  }

  /**
   * "No negative balances" — a defensive guard applied to a *computed*
   * new balance before it is written, independent of the database's own
   * `CHECK (... >= 0)` constraint (docs/04_Database schema review). The
   * DB constraint is the last line of defense against a bug; this rule
   * is what turns that bug into a clear application-level error instead
   * of a raw constraint-violation exception reaching the caller.
   */
  static assertResultNotNegative(newAmount: Prisma.Decimal, label = 'resulting balance'): void {
    if (newAmount.lt(0)) {
      throw new BadRequestException(`${label} cannot go negative (would be ${newAmount.toFixed(2)}).`);
    }
  }
}
