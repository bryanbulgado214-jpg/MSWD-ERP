-- Move the bank-reconciliation match from the statement-line side (1:1) to the
-- jev-line side (1:many): one bank statement line can clear several book lines.
ALTER TABLE "jev_lines" ADD COLUMN "matched_statement_line_id" UUID;
ALTER TABLE "jev_lines" ADD COLUMN "matched_by" UUID;
ALTER TABLE "jev_lines" ADD COLUMN "matched_at" TIMESTAMPTZ(6);

-- Carry over any existing 1:1 matches.
UPDATE "jev_lines" jl
   SET "matched_statement_line_id" = bsl."id",
       "matched_by" = bsl."matched_by",
       "matched_at" = bsl."matched_at"
  FROM "bank_statement_lines" bsl
 WHERE bsl."matched_jev_line_id" = jl."id";

CREATE INDEX "jev_lines_matched_statement_line_id_idx" ON "jev_lines"("matched_statement_line_id");

ALTER TABLE "jev_lines" ADD CONSTRAINT "jev_lines_matched_statement_line_id_fkey"
  FOREIGN KEY ("matched_statement_line_id") REFERENCES "bank_statement_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "jev_lines" ADD CONSTRAINT "jev_lines_matched_by_fkey"
  FOREIGN KEY ("matched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the old statement-line-side match columns.
ALTER TABLE "bank_statement_lines" DROP CONSTRAINT IF EXISTS "bank_statement_lines_matched_jev_line_id_fkey";
ALTER TABLE "bank_statement_lines" DROP CONSTRAINT IF EXISTS "bank_statement_lines_matched_by_fkey";
DROP INDEX IF EXISTS "bank_statement_lines_matched_jev_line_id_idx";
ALTER TABLE "bank_statement_lines" DROP COLUMN "matched_jev_line_id";
ALTER TABLE "bank_statement_lines" DROP COLUMN "matched_by";
ALTER TABLE "bank_statement_lines" DROP COLUMN "matched_at";
