-- Managed end-user master: the budget officer maintains a list of requesting
-- end-users (NOT login accounts), grouped by department/section. PPMP items and
-- purchase requests reference it so procurement is planned per end-user.

CREATE TABLE "ppmp_end_users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "position" varchar(150),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid,
  "version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "ppmp_end_users_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ppmp_end_users"
  ADD CONSTRAINT "ppmp_end_users_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ppmp_end_users"
  ADD CONSTRAINT "ppmp_end_users_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ppmp_end_users_organization_id_department_id_name_key"
  ON "ppmp_end_users"("organization_id", "department_id", "name");
CREATE INDEX "ppmp_end_users_organization_id_idx" ON "ppmp_end_users"("organization_id");
CREATE INDEX "ppmp_end_users_department_id_idx" ON "ppmp_end_users"("department_id");

-- PPMP items reference an end-user (nullable; SET NULL keeps items if a record is removed)
ALTER TABLE "ppmp_items" ADD COLUMN "end_user_id" uuid;
ALTER TABLE "ppmp_items"
  ADD CONSTRAINT "ppmp_items_end_user_id_fkey"
  FOREIGN KEY ("end_user_id") REFERENCES "ppmp_end_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ppmp_items_end_user_id_idx" ON "ppmp_items"("end_user_id");

-- Purchase requests reference the requesting end-user
ALTER TABLE "purchase_requests" ADD COLUMN "end_user_id" uuid;
ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_end_user_id_fkey"
  FOREIGN KEY ("end_user_id") REFERENCES "ppmp_end_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "purchase_requests_end_user_id_idx" ON "purchase_requests"("end_user_id");
