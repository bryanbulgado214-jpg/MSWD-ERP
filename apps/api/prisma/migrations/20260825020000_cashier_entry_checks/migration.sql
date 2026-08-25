-- Checks received from customers within a teller's remittance (multiple checks
-- per entry, stored as JSON: [{ checkNumber, bankName, amount }]). The entry's
-- `amount` now holds the cashier-declared total remittance (per the teller's
-- report); cash count + checks verify it (shortage/overage).
ALTER TABLE "cashier_collection_entries" ADD COLUMN IF NOT EXISTS "checks" JSONB;
