-- APP items not in any PPMP: allow a direct APP line (e.g. a GenSet) that does
-- not originate from an end-user PPMP, carrying its own office/end-user and
-- quantity/unit figures instead of reading them through a parent PPMP item.

-- The parent PPMP link becomes optional.
ALTER TABLE "app_items" ALTER COLUMN "ppmp_item_id" DROP NOT NULL;

-- Own detail for direct lines.
ALTER TABLE "app_items" ADD COLUMN IF NOT EXISTS "department_id" UUID;
ALTER TABLE "app_items" ADD COLUMN IF NOT EXISTS "end_user_id" UUID;
ALTER TABLE "app_items" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(12, 4);
ALTER TABLE "app_items" ADD COLUMN IF NOT EXISTS "unit_of_measure" VARCHAR(30);
ALTER TABLE "app_items" ADD COLUMN IF NOT EXISTS "estimated_unit_cost" DECIMAL(18, 2);

-- Foreign keys (guarded so the migration is idempotent).
DO $$ BEGIN
  ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_end_user_id_fkey"
    FOREIGN KEY ("end_user_id") REFERENCES "ppmp_end_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "app_items_department_id_idx" ON "app_items"("department_id");
CREATE INDEX IF NOT EXISTS "app_items_end_user_id_idx" ON "app_items"("end_user_id");
