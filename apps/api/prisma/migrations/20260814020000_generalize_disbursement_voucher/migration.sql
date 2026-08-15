-- Generalize the Disbursement Voucher so it is a true accounting document.
-- Not all disbursements are procurement-related (travel, reimbursement,
-- payroll, utilities, etc.), so the procurement links become optional and a
-- free-text payee is added for non-supplier payees. A dv_type classifies each.

-- 1. Disbursement type
CREATE TYPE "dv_type" AS ENUM ('procurement', 'travel', 'reimbursement', 'payroll', 'utility', 'other');
ALTER TABLE "disbursement_vouchers" ADD COLUMN "dv_type" "dv_type" NOT NULL DEFAULT 'procurement';

-- 2. Free-text payee for non-supplier disbursements
ALTER TABLE "disbursement_vouchers" ADD COLUMN "payee_name" VARCHAR(200);
ALTER TABLE "disbursement_vouchers" ADD COLUMN "payee_tin" VARCHAR(30);
ALTER TABLE "disbursement_vouchers" ADD COLUMN "payee_address" TEXT;

-- 3. Procurement links are now optional (a DV need not come from a PR/PO/ORS)
ALTER TABLE "disbursement_vouchers" ALTER COLUMN "ors_id" DROP NOT NULL;
ALTER TABLE "disbursement_vouchers" ALTER COLUMN "purchase_request_id" DROP NOT NULL;
ALTER TABLE "disbursement_vouchers" ALTER COLUMN "purchase_order_id" DROP NOT NULL;
ALTER TABLE "disbursement_vouchers" ALTER COLUMN "supplier_id" DROP NOT NULL;
