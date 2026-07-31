// budget-validation.spec.ts — UNIT TESTS.
//
// Genuinely executable in any environment: BudgetValidation has no
// database dependency at all, and only ever uses `Prisma.Decimal` as a
// TYPE (never constructed via `new Prisma.Decimal(...)` inside this
// class) — so these tests construct real Decimal instances via the
// `decimal.js` package directly (the same underlying class Prisma
// re-exports, unmodified) and exercise the actual production code in
// src/modules/budgeting/budget-validation.ts. No mocks, no database.

import { Decimal } from 'decimal.js';

import { BudgetValidation } from './budget-validation';

describe('BudgetValidation', () => {
  describe('assertFixedPrecision — "fixed precision decimals"', () => {
    it('accepts an amount with exactly 2 decimal places', () => {
      expect(() => BudgetValidation.assertFixedPrecision(new Decimal('100.50'))).not.toThrow();
    });

    it('accepts a whole number with no decimal part', () => {
      expect(() => BudgetValidation.assertFixedPrecision(new Decimal('100'))).not.toThrow();
    });

    it('rejects an amount with more than 2 decimal places', () => {
      expect(() => BudgetValidation.assertFixedPrecision(new Decimal('100.999'))).toThrow(/at most 2 decimal places/);
    });
  });

  describe('assertPositive', () => {
    it('accepts a positive amount', () => {
      expect(() => BudgetValidation.assertPositive(new Decimal('0.01'))).not.toThrow();
    });

    it('rejects zero', () => {
      expect(() => BudgetValidation.assertPositive(new Decimal('0'))).toThrow(/greater than zero/);
    });

    it('rejects a negative amount', () => {
      expect(() => BudgetValidation.assertPositive(new Decimal('-1'))).toThrow(/greater than zero/);
    });
  });

  describe('assertNonNegative', () => {
    it('accepts zero', () => {
      expect(() => BudgetValidation.assertNonNegative(new Decimal('0'))).not.toThrow();
    });

    it('rejects a negative amount — "no negative balances"', () => {
      expect(() => BudgetValidation.assertNonNegative(new Decimal('-0.01'))).toThrow(/cannot be negative/);
    });
  });

  describe('assertReleaseIsReleased — "released budget required"', () => {
    it('accepts a release already in "released" status', () => {
      expect(() => BudgetValidation.assertReleaseIsReleased('released')).not.toThrow();
    });

    it('rejects a release still in "draft" status', () => {
      expect(() => BudgetValidation.assertReleaseIsReleased('draft')).toThrow(/must be in "released" status/);
    });

    it('rejects a cancelled release', () => {
      expect(() => BudgetValidation.assertReleaseIsReleased('cancelled')).toThrow(/must be in "released" status/);
    });
  });

  describe('assertWithinAvailableBudget — "cannot reserve beyond available budget"', () => {
    it('accepts a request exactly equal to what is available', () => {
      expect(() =>
        BudgetValidation.assertWithinAvailableBudget(new Decimal('100'), new Decimal('100')),
      ).not.toThrow();
    });

    it('accepts a request less than what is available', () => {
      expect(() =>
        BudgetValidation.assertWithinAvailableBudget(new Decimal('100'), new Decimal('50')),
      ).not.toThrow();
    });

    it('rejects a request greater than what is available', () => {
      expect(() =>
        BudgetValidation.assertWithinAvailableBudget(new Decimal('100'), new Decimal('100.01')),
      ).toThrow(/Insufficient budget/);
    });
  });

  describe('assertResultNotNegative — "no negative balances" defensive guard', () => {
    it('accepts zero', () => {
      expect(() => BudgetValidation.assertResultNotNegative(new Decimal('0'))).not.toThrow();
    });

    it('rejects a negative computed result', () => {
      expect(() => BudgetValidation.assertResultNotNegative(new Decimal('-50'))).toThrow(/cannot go negative/);
    });
  });
});
