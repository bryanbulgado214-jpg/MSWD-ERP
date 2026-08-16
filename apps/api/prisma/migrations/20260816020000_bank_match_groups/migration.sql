-- Generalize bank-reconciliation matching to many-to-many via a match group.
-- A group is a balanced set of bank statement lines + GL cash (jev) lines
-- matched together: N bank lines <-> M book lines whose signed totals are equal.

CREATE TABLE "bank_match_groups" (
  "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
  "bank_reconciliation_id" UUID NOT NULL,
  "matched_by"             UUID,
  "matched_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "bank_match_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bank_match_groups_bank_reconciliation_id_idx" ON "bank_match_groups"("bank_reconciliation_id");
ALTER TABLE "bank_match_groups"
  ADD CONSTRAINT "bank_match_groups_bank_reconciliation_id_fkey"
  FOREIGN KEY ("bank_reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_match_groups"
  ADD CONSTRAINT "bank_match_groups_matched_by_fkey"
  FOREIGN KEY ("matched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link columns on both sides.
ALTER TABLE "bank_statement_lines" ADD COLUMN "match_group_id" UUID;
ALTER TABLE "jev_lines" ADD COLUMN "match_group_id" UUID;

-- Migrate existing 1:many matches into groups — one group per matched
-- statement line, carrying its (any) matcher + timestamp.
ALTER TABLE "bank_match_groups" ADD COLUMN "_src_bsl" UUID;
INSERT INTO "bank_match_groups" ("bank_reconciliation_id", "matched_by", "matched_at", "_src_bsl")
SELECT bsl."bank_reconciliation_id",
       MAX(jl."matched_by"::text)::uuid,
       COALESCE(MAX(jl."matched_at"), now()),
       bsl."id"
  FROM "bank_statement_lines" bsl
  JOIN "jev_lines" jl ON jl."matched_statement_line_id" = bsl."id"
 GROUP BY bsl."id", bsl."bank_reconciliation_id";

UPDATE "bank_statement_lines" bsl
   SET "match_group_id" = g."id"
  FROM "bank_match_groups" g
 WHERE g."_src_bsl" = bsl."id";

UPDATE "jev_lines" jl
   SET "match_group_id" = g."id"
  FROM "bank_match_groups" g
 WHERE g."_src_bsl" = jl."matched_statement_line_id";

ALTER TABLE "bank_match_groups" DROP COLUMN "_src_bsl";

-- FKs + indexes for the new link columns.
CREATE INDEX "bank_statement_lines_match_group_id_idx" ON "bank_statement_lines"("match_group_id");
CREATE INDEX "jev_lines_match_group_id_idx" ON "jev_lines"("match_group_id");
ALTER TABLE "bank_statement_lines"
  ADD CONSTRAINT "bank_statement_lines_match_group_id_fkey"
  FOREIGN KEY ("match_group_id") REFERENCES "bank_match_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "jev_lines"
  ADD CONSTRAINT "jev_lines_match_group_id_fkey"
  FOREIGN KEY ("match_group_id") REFERENCES "bank_match_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the old jev-line-side match columns (replaced by the group link).
ALTER TABLE "jev_lines" DROP CONSTRAINT IF EXISTS "jev_lines_matched_statement_line_id_fkey";
ALTER TABLE "jev_lines" DROP CONSTRAINT IF EXISTS "jev_lines_matched_by_fkey";
DROP INDEX IF EXISTS "jev_lines_matched_statement_line_id_idx";
ALTER TABLE "jev_lines" DROP COLUMN "matched_statement_line_id";
ALTER TABLE "jev_lines" DROP COLUMN "matched_by";
ALTER TABLE "jev_lines" DROP COLUMN "matched_at";
