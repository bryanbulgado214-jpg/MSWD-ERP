-- One-person work orders (e.g. a meter reading): a single assigned personnel,
-- no team leader/members split.
ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "solo_task" BOOLEAN NOT NULL DEFAULT false;
