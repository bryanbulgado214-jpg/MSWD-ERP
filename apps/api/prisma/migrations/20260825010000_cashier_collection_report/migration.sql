-- Manual cashier daily collection report (from an external billing system):
-- admin-managed collector & area lists, the cashier's report and its per-teller
-- entries (with cash counts). Submitting a report creates a draft JEV.

-- Enum: report status
DO $$ BEGIN
  CREATE TYPE "cashier_collection_report_status" AS ENUM ('draft', 'submitted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Admin-managed collectors (tellers + the cashier)
CREATE TABLE "collectors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "is_cashier" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "collectors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collectors_organization_id_name_key" ON "collectors" ("organization_id", "name");
CREATE INDEX "collectors_organization_id_idx" ON "collectors" ("organization_id");

-- Admin-managed collection areas
CREATE TABLE "collection_areas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "collection_areas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_areas_organization_id_name_key" ON "collection_areas" ("organization_id", "name");
CREATE INDEX "collection_areas_organization_id_idx" ON "collection_areas" ("organization_id");

-- Cashier's daily collection report
CREATE TABLE "cashier_collection_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "report_number" VARCHAR(30) NOT NULL,
  "report_date" DATE NOT NULL,
  "status" "cashier_collection_report_status" NOT NULL DEFAULT 'draft',
  "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "remarks" TEXT,
  "cashier_id" UUID NOT NULL,
  "journal_entry_id" UUID,
  "submitted_at" TIMESTAMPTZ(6),
  "submitted_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by" UUID,
  "updated_by" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "cashier_collection_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cashier_collection_reports_organization_id_report_number_key" ON "cashier_collection_reports" ("organization_id", "report_number");
CREATE INDEX "cashier_collection_reports_organization_id_idx" ON "cashier_collection_reports" ("organization_id");
CREATE INDEX "cashier_collection_reports_report_date_idx" ON "cashier_collection_reports" ("report_date");
CREATE INDEX "cashier_collection_reports_status_idx" ON "cashier_collection_reports" ("status");

-- Per-teller entries within a report
CREATE TABLE "cashier_collection_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "collector_id" UUID NOT NULL,
  "collection_area_id" UUID,
  "collection_date" DATE NOT NULL,
  "gl_account_id" UUID NOT NULL,
  "or_series" VARCHAR(200) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "cash_count" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cashier_collection_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cashier_collection_entries_report_id_fkey" FOREIGN KEY ("report_id")
    REFERENCES "cashier_collection_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cashier_collection_entries_report_id_idx" ON "cashier_collection_entries" ("report_id");
