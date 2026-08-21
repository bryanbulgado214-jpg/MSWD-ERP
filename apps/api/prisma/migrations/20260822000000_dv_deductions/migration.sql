-- Free-form deduction lines on a Disbursement Voucher. Each line credits its
-- own liability/payable account when the DV is released, so the auto-JEV posts
-- exact per-deduction lines instead of folding non-tax deductions into cash.
CREATE TABLE "dv_deductions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dv_id" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "chart_of_account_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "dv_deductions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dv_deductions_dv_id_idx" ON "dv_deductions"("dv_id");

ALTER TABLE "dv_deductions"
    ADD CONSTRAINT "dv_deductions_dv_id_fkey"
    FOREIGN KEY ("dv_id") REFERENCES "disbursement_vouchers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dv_deductions"
    ADD CONSTRAINT "dv_deductions_chart_of_account_id_fkey"
    FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
