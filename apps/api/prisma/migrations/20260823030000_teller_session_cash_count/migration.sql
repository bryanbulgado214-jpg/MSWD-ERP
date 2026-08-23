-- Denomination cash-count sheet for a teller's remittance.
ALTER TABLE "teller_sessions" ADD COLUMN "cash_count" JSONB;
