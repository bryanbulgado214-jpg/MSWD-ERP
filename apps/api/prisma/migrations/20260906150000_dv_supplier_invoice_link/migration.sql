-- A DV can pay a supplier's invoice (recorded from the Supplier's Invoices
-- module). The link lets the invoice track how much of its payable is settled.
ALTER TABLE "disbursement_vouchers" ADD COLUMN "supplier_invoice_id" UUID;

ALTER TABLE "disbursement_vouchers"
  ADD CONSTRAINT "disbursement_vouchers_supplier_invoice_id_fkey"
  FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "disbursement_vouchers_supplier_invoice_id_idx"
  ON "disbursement_vouchers"("supplier_invoice_id");
