-- Multi-crew work orders: a work order can carry several crews, each with its
-- own leader, members, and field lifecycle (dispatch / complete per crew).

DO $$ BEGIN
  CREATE TYPE "work_order_crew_status" AS ENUM ('assigned', 'dispatched', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "work_order_crews" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_order_id"  UUID NOT NULL,
  "crew_number"    SMALLINT NOT NULL,
  "solo_task"      BOOLEAN NOT NULL DEFAULT false,
  "team_id"        UUID,
  "team_leader_id" UUID,
  "status"         "work_order_crew_status" NOT NULL DEFAULT 'assigned',
  "time_left"      TIMESTAMPTZ(6),
  "time_returned"  TIMESTAMPTZ(6),
  "dispatched_at"  TIMESTAMPTZ(6),
  "completed_at"   TIMESTAMPTZ(6),
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "work_order_crews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_order_crews_work_order_id_crew_number_key"
  ON "work_order_crews" ("work_order_id", "crew_number");
CREATE INDEX IF NOT EXISTS "work_order_crews_work_order_id_idx" ON "work_order_crews" ("work_order_id");

DO $$ BEGIN
  ALTER TABLE "work_order_crews"
    ADD CONSTRAINT "work_order_crews_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "work_order_crews"
    ADD CONSTRAINT "work_order_crews_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "work_order_teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "work_order_crews"
    ADD CONSTRAINT "work_order_crews_team_leader_id_fkey"
    FOREIGN KEY ("team_leader_id") REFERENCES "work_order_personnel" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "work_order_members" ADD COLUMN IF NOT EXISTS "crew_id" UUID;
CREATE INDEX IF NOT EXISTS "work_order_members_crew_id_idx" ON "work_order_members" ("crew_id");
DO $$ BEGIN
  ALTER TABLE "work_order_members"
    ADD CONSTRAINT "work_order_members_crew_id_fkey"
    FOREIGN KEY ("crew_id") REFERENCES "work_order_crews" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Back-fill: every existing work order that already had a crew assigned becomes
-- a single "Crew 1", and its current members are attached to that crew.
INSERT INTO "work_order_crews"
  ("work_order_id", "crew_number", "solo_task", "team_id", "team_leader_id", "status", "time_left", "time_returned", "dispatched_at", "completed_at")
SELECT
  wo."id", 1, wo."solo_task", wo."team_id", wo."team_leader_id",
  CASE
    WHEN wo."status" = 'in_progress' THEN 'dispatched'::"work_order_crew_status"
    WHEN wo."status" IN ('completed', 'verified') THEN 'completed'::"work_order_crew_status"
    WHEN wo."status" = 'cancelled' THEN 'cancelled'::"work_order_crew_status"
    ELSE 'assigned'::"work_order_crew_status"
  END,
  wo."time_left", wo."time_returned", wo."started_at", wo."completed_at"
FROM "work_orders" wo
WHERE wo."team_leader_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "work_order_crews" c WHERE c."work_order_id" = wo."id");

UPDATE "work_order_members" m
SET "crew_id" = c."id"
FROM "work_order_crews" c
WHERE c."work_order_id" = m."work_order_id"
  AND c."crew_number" = 1
  AND m."crew_id" IS NULL;
