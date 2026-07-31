-- Migration: set_budget_reservation_default_status
--
-- Split out from 20260728062949_extend_budget_reservation_status —
-- see that migration's comment for why this had to be a separate one.
-- By this point the new enum values have committed in their own prior
-- migration/transaction, so using 'draft' here is safe.

ALTER TABLE budget_reservations ALTER COLUMN status SET DEFAULT 'draft';
