-- District Profile: configurable entity details shown on printed forms and
-- report headings (address, contact line, and an optional logo URL).
ALTER TABLE "organization_settings" ADD COLUMN "address" VARCHAR(500);
ALTER TABLE "organization_settings" ADD COLUMN "contact" VARCHAR(255);
ALTER TABLE "organization_settings" ADD COLUMN "logo_url" VARCHAR(1000);
