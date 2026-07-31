-- Migration: fix_budgeting_naming_and_constraints
--
-- Schema review findings and fixes. Reviewed: foreign keys, constraints,
-- indexes, delete behavior, decimal precision, naming consistency across
-- all 7 Budgeting tables (budget_cycles, budget_versions, budget_headers,
-- budget_lines, budget_releases, budget_reservations,
-- budget_transaction_logs).
--
-- RESULT: foreign keys, indexes, delete behavior (RESTRICT everywhere
-- except budget_lines' CASCADE to its own header — consistent with the
-- "lines have no independent existence" rule applied elsewhere), and
-- decimal precision (numeric(18,2) throughout, no float/double anywhere)
-- were all already correct. Two real issues found and fixed below.
--
-- ISSUE 1 — Naming consistency violation:
-- docs/04_Database/MSWD_ERP_Database_Architecture_v2.md §2 requires
-- money columns to use an `_amount` SUFFIX. Two columns had it as a
-- prefix instead:
--   budget_reservations.amount_reserved      → reservation_amount
--   budget_transaction_logs.amount_signed    → signed_amount
-- ("reserved_amount" was not reused for the renamed column, since that
-- name is already in use on budget_releases for a different concept —
-- the release's aggregate reserved total, not one reservation's amount.)
--
-- ISSUE 2 — Missing constraints:
-- No CHECK constraints existed anywhere preventing a negative monetary
-- amount from being inserted — nothing stopped e.g.
-- budget_releases.released_amount = -500 from being saved silently.
-- Added non-negative CHECK constraints on every plain monetary amount
-- column. budget_transaction_logs.signed_amount is deliberately EXCLUDED
-- — it is signed by design (ledger entries increase or decrease a
-- balance) and must be allowed to be negative. Also added a CHECK that
-- budget_versions.version_number is always positive.
--
-- Same application note as prior Budgeting migrations: applied via
-- `psql` directly in this sandbox (binaries.prisma.sh unreachable here);
-- `npx prisma migrate dev` applies this file itself on a machine with
-- normal internet access.

-- ── Fix 1: rename columns to match the _amount suffix convention ──
ALTER TABLE budget_reservations RENAME COLUMN amount_reserved TO reservation_amount;
ALTER TABLE budget_transaction_logs RENAME COLUMN amount_signed TO signed_amount;

-- ── Fix 2: non-negative CHECK constraints on plain monetary amounts ──
ALTER TABLE budget_headers
  ADD CONSTRAINT budget_headers_total_amount_non_negative CHECK (total_amount >= 0);

ALTER TABLE budget_lines
  ADD CONSTRAINT budget_lines_amount_non_negative CHECK (amount >= 0);

ALTER TABLE budget_releases
  ADD CONSTRAINT budget_releases_released_amount_non_negative CHECK (released_amount >= 0),
  ADD CONSTRAINT budget_releases_reserved_amount_non_negative CHECK (reserved_amount >= 0);

ALTER TABLE budget_reservations
  ADD CONSTRAINT budget_reservations_reservation_amount_non_negative CHECK (reservation_amount >= 0);

-- ── Fix 2b: version_number must be positive ──
ALTER TABLE budget_versions
  ADD CONSTRAINT budget_versions_version_number_positive CHECK (version_number > 0);
