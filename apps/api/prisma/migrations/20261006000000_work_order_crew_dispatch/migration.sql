-- Crew-dispatch work orders: personnel roster, reusable teams, per-order crew,
-- technical/commercial nature, time out/in, instructions/remarks, tasks/issues,
-- and customer-signature flag. Additive only.

-- CreateEnum
CREATE TYPE "work_order_nature" AS ENUM ('technical', 'commercial');

-- AlterEnum: additional task types (nature is derived from the type in code)
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'relocation';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'leak_repair';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'meter_reading';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'meter_verification';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'service_inspection';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'final_reading';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'account_verification';
ALTER TYPE "work_order_type" ADD VALUE IF NOT EXISTS 'serve_notice';

-- AlterTable
ALTER TABLE "work_orders"
  ADD COLUMN "nature" "work_order_nature" NOT NULL DEFAULT 'technical',
  ADD COLUMN "customer_name" VARCHAR(255),
  ADD COLUMN "customer_signature_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "team_id" UUID,
  ADD COLUMN "team_leader_id" UUID,
  ADD COLUMN "assigned_crew_by" UUID,
  ADD COLUMN "assigned_crew_at" TIMESTAMPTZ(6),
  ADD COLUMN "time_left" TIMESTAMPTZ(6),
  ADD COLUMN "time_returned" TIMESTAMPTZ(6),
  ADD COLUMN "instructions" TEXT,
  ADD COLUMN "remarks" TEXT,
  ADD COLUMN "tasks_performed" TEXT,
  ADD COLUMN "issues_encountered" TEXT;

-- CreateTable
CREATE TABLE "work_order_personnel" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "designation" VARCHAR(100),
  "section" "work_order_nature",
  "contact_number" VARCHAR(50),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "work_order_personnel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "work_order_personnel_organization_id_idx" ON "work_order_personnel"("organization_id");

-- CreateTable
CREATE TABLE "work_order_teams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "section" "work_order_nature",
  "leader_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "work_order_teams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_teams_organization_id_name_key" ON "work_order_teams"("organization_id", "name");
CREATE INDEX "work_order_teams_organization_id_idx" ON "work_order_teams"("organization_id");

-- CreateTable
CREATE TABLE "work_order_team_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "team_id" UUID NOT NULL,
  "personnel_id" UUID NOT NULL,
  CONSTRAINT "work_order_team_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_team_members_team_id_personnel_id_key" ON "work_order_team_members"("team_id", "personnel_id");
CREATE INDEX "work_order_team_members_team_id_idx" ON "work_order_team_members"("team_id");

-- CreateTable
CREATE TABLE "work_order_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_order_id" UUID NOT NULL,
  "personnel_id" UUID NOT NULL,
  "is_leader" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "work_order_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_order_members_work_order_id_personnel_id_key" ON "work_order_members"("work_order_id", "personnel_id");
CREATE INDEX "work_order_members_work_order_id_idx" ON "work_order_members"("work_order_id");

-- Foreign keys
ALTER TABLE "work_order_personnel" ADD CONSTRAINT "work_order_personnel_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_teams" ADD CONSTRAINT "work_order_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_teams" ADD CONSTRAINT "work_order_teams_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "work_order_personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_order_team_members" ADD CONSTRAINT "work_order_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "work_order_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_team_members" ADD CONSTRAINT "work_order_team_members_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "work_order_personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_members" ADD CONSTRAINT "work_order_members_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_members" ADD CONSTRAINT "work_order_members_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "work_order_personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "work_order_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_team_leader_id_fkey" FOREIGN KEY ("team_leader_id") REFERENCES "work_order_personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_crew_by_fkey" FOREIGN KEY ("assigned_crew_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
