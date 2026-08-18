-- Add the one column that had drifted into dev via `db push` without a matching
-- migration, so a fresh `migrate deploy` (e.g. CI) yields a DB the Prisma client
-- matches. Without it the demo seed fails: `purchase_requests.remarks` missing.
-- (The other items in `migrate diff` are cosmetic — FK re-creations and indexes
-- already produced by earlier migrations — and are intentionally omitted.)
ALTER TABLE "purchase_requests" ADD COLUMN "remarks" TEXT;
