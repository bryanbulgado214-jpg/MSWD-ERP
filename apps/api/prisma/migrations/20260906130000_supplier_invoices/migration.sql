-- Supplier's invoices (payables / bills). Recorded in Accounting since this
-- client has no Procurement module. Recording an invoice posts the payable JEV
-- (Dr charges / Cr Accounts Payable); payment is made from this module later.
CREATE TABLE "supplier_invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "invoice_number" VARCHAR(60) NOT NULL,
  "supplier_name" VARCHAR(200) NOT NULL,
  "supplier_tin" VARCHAR(30),
  "supplier_address" VARCHAR(255),
  "invoice_date" DATE NOT NULL,
  "term" VARCHAR(60),
  "particulars" TEXT NOT NULL,
  "gross_amount" DECIMAL(18,2) NOT NULL,
  "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(18,2) NOT NULL,
  "amount_paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  "gl_lines" JSONB NOT NULL,
  "due_schedule" JSONB,
  "journal_entry_id" UUID,
  "ap_account_id" UUID,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_invoices_organization_id_idx" ON "supplier_invoices"("organization_id");
CREATE INDEX "supplier_invoices_status_idx" ON "supplier_invoices"("status");
