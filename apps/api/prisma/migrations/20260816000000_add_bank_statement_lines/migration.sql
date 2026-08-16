-- Imported bank-statement transactions for the QuickBooks/Intacct-style
-- match-and-clear bank reconciliation.
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_reconciliation_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference_number" VARCHAR(100),
    "amount" DECIMAL(18,2) NOT NULL,
    "matched_jev_line_id" UUID,
    "matched_by" UUID,
    "matched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_statement_lines_bank_reconciliation_id_idx" ON "bank_statement_lines"("bank_reconciliation_id");
CREATE INDEX "bank_statement_lines_matched_jev_line_id_idx" ON "bank_statement_lines"("matched_jev_line_id");

ALTER TABLE "bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_bank_reconciliation_id_fkey"
    FOREIGN KEY ("bank_reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_matched_jev_line_id_fkey"
    FOREIGN KEY ("matched_jev_line_id") REFERENCES "jev_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_matched_by_fkey"
    FOREIGN KEY ("matched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
