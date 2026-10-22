-- Budget Utilization Report: per-fiscal-year category lines (Personnel Services,
-- MOOE, Capital Outlay) with the year's budget and the GL accounts whose posted
-- disbursements roll into each line. Additive + idempotent.

DO $$ BEGIN
  CREATE TYPE "budget_utilization_section" AS ENUM ('personnel_services', 'mooe', 'capital_outlay');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "budget_utilization_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "fiscal_year_id" UUID NOT NULL,
  "section" "budget_utilization_section" NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "budget_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "app_cross_check" BOOLEAN NOT NULL DEFAULT false,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "budget_utilization_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_utilization_lines_org_fy_idx"
  ON "budget_utilization_lines" ("organization_id", "fiscal_year_id");

CREATE TABLE IF NOT EXISTS "budget_utilization_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "budget_utilization_line_id" UUID NOT NULL,
  "chart_of_account_id" UUID NOT NULL,
  CONSTRAINT "budget_utilization_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "budget_utilization_accounts_line_coa_key"
  ON "budget_utilization_accounts" ("budget_utilization_line_id", "chart_of_account_id");
CREATE INDEX IF NOT EXISTS "budget_utilization_accounts_coa_idx"
  ON "budget_utilization_accounts" ("chart_of_account_id");

DO $$ BEGIN
  ALTER TABLE "budget_utilization_accounts"
    ADD CONSTRAINT "budget_utilization_accounts_line_fk"
    FOREIGN KEY ("budget_utilization_line_id") REFERENCES "budget_utilization_lines"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "budget_utilization_accounts"
    ADD CONSTRAINT "budget_utilization_accounts_coa_fk"
    FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "budget_utilization_lines"
    ADD CONSTRAINT "budget_utilization_lines_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "budget_utilization_lines"
    ADD CONSTRAINT "budget_utilization_lines_fy_fk"
    FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
