-- Petty cash: the custodian (cashier) records a voucher without an expense
-- account; the accountant assigns the charge account during replenishment
-- review (before posting). So the charge account is optional at creation.
ALTER TABLE "petty_cash_vouchers" ALTER COLUMN "charge_account_id" DROP NOT NULL;
