-- Admin-configured signatories for printed documents (per document, per slot).
-- Nullable JSONB: existing rows keep working; forms fall back to their prior
-- behavior (actor name / hard-coded title / blank) until the admin fills it in.
ALTER TABLE "organization_settings" ADD COLUMN "signatories" JSONB;
