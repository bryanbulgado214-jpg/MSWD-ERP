-- Per-user PPMP allocation
--
-- Adds assigned_user_id to ppmp_items so each PPMP item can be tagged
-- to a specific end-user. Also adds CBO notes, mode of procurement,
-- and schedule quarter fields that mirror the real PPMP Excel form.

ALTER TABLE "ppmp_items"
  ADD COLUMN "assigned_user_id" UUID,
  ADD COLUMN "cbo_notes" VARCHAR(500),
  ADD COLUMN "mode_of_procurement" VARCHAR(100),
  ADD COLUMN "schedule_quarter" SMALLINT;

-- FK to users table
ALTER TABLE "ppmp_items"
  ADD CONSTRAINT "ppmp_items_assigned_user_id_fkey"
    FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for fast per-user lookups
CREATE INDEX "ppmp_items_assigned_user_id_idx" ON "ppmp_items"("assigned_user_id");

-- Composite index for the most common query: "show me my PPMP items for this fiscal year"
CREATE INDEX "ppmp_items_assigned_user_fiscal_year_idx"
  ON "ppmp_items"("assigned_user_id", "fiscal_year_id");
