-- Accounting payee master. Payees are never deleted — only deactivated or
-- merged into another payee.
CREATE TABLE "payees" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name"            VARCHAR(255) NOT NULL,
  "address"         TEXT,
  "tin"             VARCHAR(30),
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "merged_into_id"  UUID,
  "created_by"      UUID,
  "updated_by"      UUID,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"         INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payees_organization_id_idx" ON "payees"("organization_id");
CREATE INDEX "payees_tin_idx" ON "payees"("tin");

ALTER TABLE "payees"
  ADD CONSTRAINT "payees_merged_into_id_fkey"
  FOREIGN KEY ("merged_into_id") REFERENCES "payees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
