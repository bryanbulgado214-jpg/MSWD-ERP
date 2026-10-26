-- Per-line "excluded contra" accounts for the Budget Utilization Report: a debit
-- to a line's mapped account is dropped when its voucher also credits one of these
-- (keeps the month-end supplies-inventory reclass out of the figure). Additive +
-- idempotent.

CREATE TABLE IF NOT EXISTS "budget_utilization_excluded_contras" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "budget_utilization_line_id" UUID NOT NULL,
  "chart_of_account_id" UUID NOT NULL,
  CONSTRAINT "budget_utilization_excluded_contras_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "budget_utilization_excluded_contras_line_coa_key"
  ON "budget_utilization_excluded_contras" ("budget_utilization_line_id", "chart_of_account_id");
CREATE INDEX IF NOT EXISTS "budget_utilization_excluded_contras_coa_idx"
  ON "budget_utilization_excluded_contras" ("chart_of_account_id");

DO $$ BEGIN
  ALTER TABLE "budget_utilization_excluded_contras"
    ADD CONSTRAINT "budget_utilization_excluded_contras_line_fk"
    FOREIGN KEY ("budget_utilization_line_id") REFERENCES "budget_utilization_lines"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "budget_utilization_excluded_contras"
    ADD CONSTRAINT "budget_utilization_excluded_contras_coa_fk"
    FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
