-- A teller's remittance can split across several GL accounts (accounts
-- receivable, installation fee, relocation fee, …). Store the breakdown as JSON
-- [{ glAccountId, amount }]; the entry's `amount` (declared total remittance) is
-- the sum. The old single gl_account_id becomes optional (unused going forward).
ALTER TABLE "cashier_collection_entries" ADD COLUMN IF NOT EXISTS "gl_lines" JSONB;
ALTER TABLE "cashier_collection_entries" ALTER COLUMN "gl_account_id" DROP NOT NULL;
