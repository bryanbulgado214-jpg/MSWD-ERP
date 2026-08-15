-- Link each bank account to its Cash-in-Bank ledger (COA) account, so a
-- disbursement can auto-credit the correct GL account when a bank account is
-- chosen as the paying account on the Disbursement Voucher.
ALTER TABLE "bank_accounts" ADD COLUMN "chart_of_account_id" UUID;

ALTER TABLE "bank_accounts"
  ADD CONSTRAINT "bank_accounts_chart_of_account_id_fkey"
  FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "bank_accounts_chart_of_account_id_idx" ON "bank_accounts"("chart_of_account_id");
