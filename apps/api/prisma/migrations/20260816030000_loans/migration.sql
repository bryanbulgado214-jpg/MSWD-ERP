-- Loans payable + amortization schedules.
CREATE TABLE "loans" (
  "id"                          UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"             UUID NOT NULL,
  "name"                        VARCHAR(200) NOT NULL,
  "loan_type"                   VARCHAR(20) NOT NULL DEFAULT 'new',
  "principal"                   DECIMAL(18,2) NOT NULL,
  "annual_rate_pct"             DECIMAL(9,4),
  "term_periods"                INTEGER,
  "frequency"                   VARCHAR(20),
  "method"                      VARCHAR(20),
  "start_date"                  DATE,
  "first_payment_date"          DATE,
  "loans_payable_account_id"    UUID NOT NULL,
  "interest_expense_account_id" UUID NOT NULL,
  "bank_account_id"             UUID NOT NULL,
  "status"                      VARCHAR(20) NOT NULL DEFAULT 'draft',
  "drawdown_jev_id"             UUID,
  "remarks"                     TEXT,
  "created_by"                  UUID NOT NULL,
  "updated_by"                  UUID NOT NULL,
  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"                     INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "loans_organization_id_idx" ON "loans"("organization_id");

CREATE TABLE "loan_amortizations" (
  "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
  "loan_id"                  UUID NOT NULL,
  "seq"                      INTEGER NOT NULL,
  "due_date"                 DATE NOT NULL,
  "beginning_balance"        DECIMAL(18,2) NOT NULL,
  "payment"                  DECIMAL(18,2) NOT NULL,
  "interest"                 DECIMAL(18,2) NOT NULL,
  "principal"                DECIMAL(18,2) NOT NULL,
  "ending_balance"           DECIMAL(18,2) NOT NULL,
  "disbursement_voucher_id"  UUID,
  "paid_manual"              BOOLEAN NOT NULL DEFAULT false,
  "paid_manual_at"           TIMESTAMPTZ(6),
  "paid_manual_by"           UUID,
  "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "loan_amortizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_amortizations_loan_id_seq_key" ON "loan_amortizations"("loan_id", "seq");
CREATE INDEX "loan_amortizations_loan_id_idx" ON "loan_amortizations"("loan_id");
CREATE INDEX "loan_amortizations_disbursement_voucher_id_idx" ON "loan_amortizations"("disbursement_voucher_id");

ALTER TABLE "loan_amortizations"
  ADD CONSTRAINT "loan_amortizations_loan_id_fkey"
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
