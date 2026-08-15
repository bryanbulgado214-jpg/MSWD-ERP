-- Accounting: add the `reversed` status to journal_entry_vouchers.
--
-- Enum value additions are split into their own migration (this file)
-- separate from any migration that USES the value. PostgreSQL requires a
-- new enum value to be committed before it can be referenced, so a value
-- added and used inside the same transaction fails. Keeping the ADD VALUE
-- alone here (and any use of it in a later migration) honors that rule and
-- matches the project's existing enum-change convention
-- (see 20260728062949_extend_budget_reservation_status).

ALTER TYPE "jev_status" ADD VALUE IF NOT EXISTS 'reversed';
