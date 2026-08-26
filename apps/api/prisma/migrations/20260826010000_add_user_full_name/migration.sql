-- Optional display name for a user (the real person behind the login).
-- Nullable: existing rows keep working; the UI falls back to `username`.
ALTER TABLE "users" ADD COLUMN "full_name" VARCHAR(120);
