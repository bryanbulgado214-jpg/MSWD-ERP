-- Migration: extend_budget_reservation_status
--
-- The Reservation Service needs a fuller lifecycle than
-- budget_reservation_status originally supported (active, released,
-- cancelled) — specifically draft, submitted, approved, and rejected,
-- so a reservation can exist WITHOUT holding any budget (draft) before
-- the commitment-stage action (submit) actually reserves it, per
-- docs/04_Database §12 ("draft-stage behavior is different on purpose").
--
-- budget_reservations is empty in every environment this has been
-- applied to so far (confirmed via `SELECT count(*)` before writing
-- this), so no data backfill is needed — this only adds new enum
-- values here. Changing the column's default to one of these new
-- values is a SEPARATE migration
-- (20260729010000_set_budget_reservation_default_status) — Postgres
-- refuses to let a newly-added enum value be used anywhere, including
-- in a DEFAULT clause, within the same transaction that added it
-- ("unsafe use of new value ... New enum values must be committed
-- before they can be used"), and `prisma migrate deploy` runs each
-- migration file inside one transaction. Splitting into two migrations
-- (two separate transactions) is the standard fix.

ALTER TYPE budget_reservation_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'active';
ALTER TYPE budget_reservation_status ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'active';
ALTER TYPE budget_reservation_status ADD VALUE IF NOT EXISTS 'approved' BEFORE 'active';
ALTER TYPE budget_reservation_status ADD VALUE IF NOT EXISTS 'rejected' BEFORE 'active';
