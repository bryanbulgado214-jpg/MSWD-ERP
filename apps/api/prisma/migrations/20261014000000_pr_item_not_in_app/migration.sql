-- Per-line "Not in APP" flag: marks a catch-up / off-plan purchase-request line
-- that is not covered by the Annual Procurement Plan, for realignment tracking.

ALTER TABLE "purchase_request_items"
  ADD COLUMN IF NOT EXISTS "not_in_app" BOOLEAN NOT NULL DEFAULT false;
