-- Petty cash replenishment now routes through a draft Disbursement Voucher.
-- The accountant APPROVES the replenishment (creating a draft reimbursement DV);
-- posting that DV is what posts the imprest JEV, marks the vouchers replenished
-- and restores the fund. New 'approved' status + a link to the raised DV.

ALTER TYPE "petty_cash_replenishment_status" ADD VALUE IF NOT EXISTS 'approved' BEFORE 'posted';

ALTER TABLE "petty_cash_replenishments" ADD COLUMN IF NOT EXISTS "dv_id" uuid;

CREATE INDEX IF NOT EXISTS "petty_cash_replenishments_dv_id_idx"
  ON "petty_cash_replenishments" ("dv_id");
