-- Customer Complaint/Concern Form (CCF) — a standalone customer-concern register
-- in the Work Order module, with an optional WorkOrder → CCF tag.

DO $$ BEGIN
  CREATE TYPE "ccf_category" AS ENUM ('billing', 'water_quality', 'leakage', 'low_pressure', 'no_water', 'meter_issue', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ccf_status" AS ENUM ('pending', 'in_progress', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "customer_concerns" (
  "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"        UUID NOT NULL,
  "reference_number"       VARCHAR(20) NOT NULL,
  "received_at"            TIMESTAMPTZ(6) NOT NULL,
  "customer_name"          VARCHAR(200) NOT NULL,
  "account_number"         VARCHAR(50),
  "category"               "ccf_category" NOT NULL,
  "nature"                 TEXT NOT NULL,
  "requested_action"       TEXT,
  "assigned_to"            VARCHAR(200),
  "action_taken"           TEXT,
  "status"                 "ccf_status" NOT NULL DEFAULT 'pending',
  "target_resolution_date" DATE,
  "resolved_at"            TIMESTAMPTZ(6),
  "remarks"                TEXT,
  "created_by"             UUID,
  "updated_by"             UUID,
  "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"                INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "customer_concerns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_concerns_organization_id_reference_number_key"
  ON "customer_concerns" ("organization_id", "reference_number");
CREATE INDEX IF NOT EXISTS "customer_concerns_organization_id_status_idx"
  ON "customer_concerns" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "customer_concerns_organization_id_category_idx"
  ON "customer_concerns" ("organization_id", "category");
CREATE INDEX IF NOT EXISTS "customer_concerns_received_at_idx"
  ON "customer_concerns" ("received_at");

-- WorkOrder → CCF tag (optional).
ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "customer_concern_id" UUID;

CREATE INDEX IF NOT EXISTS "work_orders_customer_concern_id_idx"
  ON "work_orders" ("customer_concern_id");

DO $$ BEGIN
  ALTER TABLE "work_orders"
    ADD CONSTRAINT "work_orders_customer_concern_id_fkey"
    FOREIGN KEY ("customer_concern_id") REFERENCES "customer_concerns" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
