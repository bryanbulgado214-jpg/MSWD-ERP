-- Receiving & Inspection Reports
CREATE TYPE inspection_status AS ENUM ('draft', 'submitted', 'accepted', 'rejected', 'cancelled');

CREATE TABLE inspection_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  report_number   VARCHAR(30) NOT NULL,
  report_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  purchase_request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  delivery_date   DATE NOT NULL,
  delivery_note   VARCHAR(100),
  invoice_number  VARCHAR(50),
  invoice_date    DATE,
  overall_result  VARCHAR(20) NOT NULL DEFAULT 'pending',
  findings        TEXT,
  recommendations TEXT,
  status          inspection_status NOT NULL DEFAULT 'draft',
  inspected_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  inspected_at    TIMESTAMPTZ,
  accepted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  version         INT NOT NULL DEFAULT 1,
  UNIQUE (organization_id, report_number)
);

CREATE INDEX idx_inspection_reports_org ON inspection_reports(organization_id);
CREATE INDEX idx_inspection_reports_po ON inspection_reports(purchase_order_id);
CREATE INDEX idx_inspection_reports_pr ON inspection_reports(purchase_request_id);
CREATE INDEX idx_inspection_reports_status ON inspection_reports(status);

CREATE TABLE inspection_report_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_report_id UUID NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  pr_item_id           UUID REFERENCES purchase_request_items(id) ON DELETE SET NULL,
  description          TEXT NOT NULL,
  unit_of_measure      VARCHAR(30),
  quantity_ordered     DECIMAL(18,4) NOT NULL DEFAULT 0,
  quantity_delivered   DECIMAL(18,4) NOT NULL DEFAULT 0,
  quantity_accepted    DECIMAL(18,4) NOT NULL DEFAULT 0,
  quantity_rejected    DECIMAL(18,4) NOT NULL DEFAULT 0,
  result               VARCHAR(20) NOT NULL DEFAULT 'pending',
  remarks              TEXT,
  item_number          INT NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_items_report ON inspection_report_items(inspection_report_id);

-- Add sequence for inspection report numbers
INSERT INTO document_sequences (id, organization_id, document_type, fiscal_year_id, prefix, next_number, padding)
SELECT
  gen_random_uuid(),
  o.id,
  'INSPECTION_REPORT',
  fy.id,
  'IR',
  1,
  6
FROM organizations o
CROSS JOIN fiscal_years fy
WHERE fy.organization_id = o.id
ON CONFLICT DO NOTHING;

-- Seed inspection permission
INSERT INTO permissions (id, code, name, module) VALUES
  (gen_random_uuid(), 'procurement.inspection.create', 'Create Inspection Reports', 'procurement'),
  (gen_random_uuid(), 'procurement.inspection.accept', 'Accept/Reject Inspection Reports', 'procurement')
ON CONFLICT (code) DO NOTHING;

-- Grant inspection permissions to relevant roles
INSERT INTO role_permissions (id, role_id, permission_id, created_by)
SELECT gen_random_uuid(), r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('ADMIN', 'PROCUREMENT_OFFICER')
  AND p.code IN ('procurement.inspection.create', 'procurement.inspection.accept')
ON CONFLICT DO NOTHING;

-- Also grant to PROPERTY_INSPECTOR role if it exists
INSERT INTO role_permissions (id, role_id, permission_id, created_by)
SELECT gen_random_uuid(), r.id, p.id, NULL
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'GENERAL_MANAGER'
  AND p.code = 'procurement.inspection.accept'
ON CONFLICT DO NOTHING;

-- Audit trigger
CREATE TRIGGER trg_inspection_reports_audit
  AFTER INSERT OR UPDATE OR DELETE ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
