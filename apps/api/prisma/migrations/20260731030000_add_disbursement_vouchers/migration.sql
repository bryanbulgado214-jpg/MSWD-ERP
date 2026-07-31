-- Disbursement Voucher module

-- Status enum for disbursement vouchers
CREATE TYPE "dv_status" AS ENUM (
  'draft',
  'for_certification',
  'certified',
  'for_approval',
  'approved',
  'released',
  'cancelled'
);

-- Mode of payment enum
CREATE TYPE "payment_mode" AS ENUM (
  'check',
  'ada',
  'others'
);

-- Disbursement Vouchers table
CREATE TABLE "disbursement_vouchers" (
  "id"                    UUID            NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"       UUID            NOT NULL,
  "dv_number"             VARCHAR(30)     NOT NULL,
  "dv_date"               TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "ors_id"                UUID            NOT NULL,
  "purchase_request_id"   UUID            NOT NULL,
  "purchase_order_id"     UUID            NOT NULL,
  "supplier_id"           UUID            NOT NULL,
  "inspection_report_id"  UUID,
  "fund_source_id"        UUID,
  "responsibility_center_id" UUID,
  "account_code"          VARCHAR(30),
  "particulars"           TEXT            NOT NULL,
  "payment_mode"          "payment_mode"  NOT NULL DEFAULT 'check',
  "gross_amount"          DECIMAL(18,2)   NOT NULL DEFAULT 0,
  "tax_amount"            DECIMAL(18,2)   NOT NULL DEFAULT 0,
  "other_deductions"      DECIMAL(18,2)   NOT NULL DEFAULT 0,
  "net_amount"            DECIMAL(18,2)   NOT NULL DEFAULT 0,
  "check_number"          VARCHAR(50),
  "check_date"            DATE,
  "bank_name"             VARCHAR(100),
  "certified_by"          UUID,
  "certified_at"          TIMESTAMPTZ,
  "approved_by"           UUID,
  "approved_at"           TIMESTAMPTZ,
  "released_by"           UUID,
  "released_at"           TIMESTAMPTZ,
  "status"                "dv_status"     NOT NULL DEFAULT 'draft',
  "remarks"               TEXT,
  "created_by"            UUID            NOT NULL,
  "updated_by"            UUID            NOT NULL,
  "created_at"            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "version"               INTEGER         NOT NULL DEFAULT 1,

  CONSTRAINT "disbursement_vouchers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "disbursement_vouchers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
  CONSTRAINT "disbursement_vouchers_ors_id_fkey" FOREIGN KEY ("ors_id") REFERENCES "obligation_requests"("id"),
  CONSTRAINT "disbursement_vouchers_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id"),
  CONSTRAINT "disbursement_vouchers_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id"),
  CONSTRAINT "disbursement_vouchers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id"),
  CONSTRAINT "disbursement_vouchers_inspection_report_id_fkey" FOREIGN KEY ("inspection_report_id") REFERENCES "inspection_reports"("id"),
  CONSTRAINT "disbursement_vouchers_fund_source_id_fkey" FOREIGN KEY ("fund_source_id") REFERENCES "fund_sources"("id"),
  CONSTRAINT "disbursement_vouchers_responsibility_center_id_fkey" FOREIGN KEY ("responsibility_center_id") REFERENCES "responsibility_centers"("id"),
  CONSTRAINT "disbursement_vouchers_certified_by_fkey" FOREIGN KEY ("certified_by") REFERENCES "users"("id"),
  CONSTRAINT "disbursement_vouchers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id"),
  CONSTRAINT "disbursement_vouchers_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "users"("id"),
  CONSTRAINT "disbursement_vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "disbursement_vouchers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id")
);

-- Unique DV number per organization
CREATE UNIQUE INDEX "disbursement_vouchers_org_dv_number_key" ON "disbursement_vouchers"("organization_id", "dv_number");

-- Common query indexes
CREATE INDEX "disbursement_vouchers_org_status_idx" ON "disbursement_vouchers"("organization_id", "status");
CREATE INDEX "disbursement_vouchers_ors_id_idx" ON "disbursement_vouchers"("ors_id");
CREATE INDEX "disbursement_vouchers_po_id_idx" ON "disbursement_vouchers"("purchase_order_id");
CREATE INDEX "disbursement_vouchers_supplier_id_idx" ON "disbursement_vouchers"("supplier_id");

-- Seed document sequence for DV numbering
INSERT INTO "document_sequences" ("organization_id", "document_type", "prefix", "next_number")
SELECT o.id, 'DISBURSEMENT_VOUCHER', 'DV-', 1
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "document_sequences" ds
  WHERE ds.organization_id = o.id AND ds.document_type = 'DISBURSEMENT_VOUCHER'
);

-- DV permissions
INSERT INTO "permissions" ("code", "name", "module") VALUES
  ('procurement.dv.create', 'Create Disbursement Voucher', 'procurement'),
  ('procurement.dv.certify', 'Certify Disbursement Voucher', 'procurement'),
  ('procurement.dv.approve', 'Approve Disbursement Voucher', 'procurement'),
  ('procurement.dv.release', 'Release Disbursement Voucher', 'procurement')
ON CONFLICT ("code") DO NOTHING;

-- Grant permissions to roles
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r, "permissions" p
WHERE r.code = 'ADMIN' AND p.code IN (
  'procurement.dv.create', 'procurement.dv.certify', 'procurement.dv.approve', 'procurement.dv.release'
) ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r, "permissions" p
WHERE r.code = 'ACCOUNTANT' AND p.code IN (
  'procurement.dv.create', 'procurement.dv.certify'
) ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r, "permissions" p
WHERE r.code = 'GENERAL_MANAGER' AND p.code IN (
  'procurement.dv.approve', 'procurement.dv.release'
) ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r, "permissions" p
WHERE r.code = 'CASHIER' AND p.code IN (
  'procurement.dv.release'
) ON CONFLICT DO NOTHING;

-- Audit trigger
CREATE TRIGGER "trg_audit_disbursement_vouchers"
AFTER INSERT OR UPDATE OR DELETE ON "disbursement_vouchers"
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
