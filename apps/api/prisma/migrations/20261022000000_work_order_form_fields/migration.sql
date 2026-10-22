-- Work Order paper-form alignment: contact number + team-leader received timestamp
-- on work orders, and a contact number on CCFs (so it auto-fills into the WO).
-- Idempotent: safe to run against a DB that already has any of these columns.

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "contact_number" VARCHAR(50);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "leader_received_at" TIMESTAMPTZ(6);

ALTER TABLE "customer_concerns" ADD COLUMN IF NOT EXISTS "contact_number" VARCHAR(50);
