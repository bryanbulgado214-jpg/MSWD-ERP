-- Staff availability master list (admin-managed; section heads view-only).

DO $$ BEGIN
  CREATE TYPE "staff_availability_status" AS ENUM ('available', 'on_field', 'on_leave', 'unavailable');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "staff_members" (
  "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"         UUID NOT NULL,
  "name"                    VARCHAR(255) NOT NULL,
  "designation"             VARCHAR(150),
  "department"              VARCHAR(150),
  "contact_number"          VARCHAR(50),
  "status"                  "staff_availability_status" NOT NULL DEFAULT 'available',
  "status_note"             VARCHAR(255),
  "is_field_personnel"      BOOLEAN NOT NULL DEFAULT false,
  "work_order_personnel_id" UUID,
  "is_active"               BOOLEAN NOT NULL DEFAULT true,
  "created_by"              UUID,
  "updated_by"              UUID,
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"                 INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_members_work_order_personnel_id_key"
  ON "staff_members" ("work_order_personnel_id");
CREATE INDEX IF NOT EXISTS "staff_members_organization_id_idx" ON "staff_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "staff_members_status_idx" ON "staff_members" ("status");

ALTER TABLE "staff_members"
  ADD CONSTRAINT "staff_members_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_members"
  ADD CONSTRAINT "staff_members_work_order_personnel_id_fkey"
  FOREIGN KEY ("work_order_personnel_id") REFERENCES "work_order_personnel" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
