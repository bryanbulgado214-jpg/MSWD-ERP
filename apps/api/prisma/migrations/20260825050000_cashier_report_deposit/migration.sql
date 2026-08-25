-- Records when the cashier's deposited collections appear in the bank
-- passbook/statement. Recording a deposit creates a draft JEV (Dr Bank,
-- Cr Cash - Collecting Officer) for the accountant to review and post.
ALTER TABLE "cashier_collection_reports"
  ADD COLUMN "deposit_recorded_at"      timestamptz(6),
  ADD COLUMN "deposit_date"             date,
  ADD COLUMN "deposit_journal_entry_id" uuid,
  ADD COLUMN "deposit_bank_account_id"  uuid,
  ADD COLUMN "deposit_recorded_by"      uuid;
