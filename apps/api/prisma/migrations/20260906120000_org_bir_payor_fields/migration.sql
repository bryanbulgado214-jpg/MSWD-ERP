-- District (payor) identity for BIR forms (e.g. Form 2307). All nullable so
-- existing rows keep working; the payor section falls back to blank until the
-- admin fills these in under Admin → District Profile.
ALTER TABLE "organization_settings" ADD COLUMN "tin" VARCHAR(20);
ALTER TABLE "organization_settings" ADD COLUMN "zip_code" VARCHAR(10);
ALTER TABLE "organization_settings" ADD COLUMN "bir_rep_name" VARCHAR(150);
ALTER TABLE "organization_settings" ADD COLUMN "bir_rep_designation" VARCHAR(150);
ALTER TABLE "organization_settings" ADD COLUMN "bir_rep_tin" VARCHAR(20);
