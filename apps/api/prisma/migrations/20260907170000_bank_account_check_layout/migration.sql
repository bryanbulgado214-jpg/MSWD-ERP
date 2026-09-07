-- Per-bank-account check-printing layout (field positions + font sizes), set by
-- the cashier via the Check Alignment screen. Null = the built-in default layout.
ALTER TABLE "bank_accounts" ADD COLUMN "check_layout" JSONB;
