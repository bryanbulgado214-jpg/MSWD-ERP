-- Direct per-user permission grants (unioned with role permissions at resolve time).
CREATE TABLE "user_permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "granted_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_permissions_user_id_permission_id_key" ON "user_permissions"("user_id", "permission_id");
CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions"("user_id");

ALTER TABLE "user_permissions"
  ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions"
  ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions"
  ADD CONSTRAINT "user_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual document-numbering toggle for back-entering historical JEVs/DVs.
ALTER TABLE "organization_settings"
  ADD COLUMN "manual_document_numbering" BOOLEAN NOT NULL DEFAULT false;
