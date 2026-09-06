-- Which installment of a supplier invoice's payment schedule a DV pays
-- (1-based index into the invoice's due_schedule). Null when there is no plan.
ALTER TABLE "disbursement_vouchers" ADD COLUMN "supplier_invoice_installment" SMALLINT;
