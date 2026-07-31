-- CAF / ORS Foundation Migration
-- Adds: suppliers, purchase_orders, certifications_of_availability,
--        obligation_requests, ors_children, ors_adjustments
-- Extends: budget_transaction_type enum, purchase_request_status (no new values needed)

-- ════════════════════════════════════════════════════════════════════
-- NEW ENUMS
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE purchase_order_status AS ENUM (
  'draft',
  'pending_caf',
  'for_approval',
  'approved',
  'cancelled'
);

CREATE TYPE caf_status AS ENUM (
  'draft',
  'for_certification',
  'certified',
  'rejected',
  'cancelled',
  'superseded'
);

CREATE TYPE ors_status AS ENUM (
  'draft',
  'for_requesting_certification',
  'for_budget_certification',
  'obligated',
  'partially_payable',
  'partially_paid',
  'fully_paid',
  'adjusted',
  'cancelled',
  'closed'
);

CREATE TYPE ors_child_type AS ENUM (
  'billing',
  'inspection',
  'payable',
  'disbursement_voucher',
  'payment',
  'retention',
  'deduction',
  'adjustment'
);

-- ════════════════════════════════════════════════════════════════════
-- EXTEND budget_transaction_type with obligation types
-- ════════════════════════════════════════════════════════════════════

ALTER TYPE budget_transaction_type ADD VALUE IF NOT EXISTS 'obligation';
ALTER TYPE budget_transaction_type ADD VALUE IF NOT EXISTS 'obligation_release';

-- ════════════════════════════════════════════════════════════════════
-- SUPPLIERS
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            varchar(255) NOT NULL,
  tin             varchar(30),
  address         text,
  contact_person  varchar(255),
  contact_number  varchar(50),
  email           varchar(255),
  is_active       boolean      NOT NULL DEFAULT true,
  created_at      timestamptz(6) NOT NULL DEFAULT now(),
  updated_at      timestamptz(6) NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  version         int          NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX suppliers_org_name_key ON suppliers(organization_id, name);
CREATE INDEX suppliers_org_idx ON suppliers(organization_id);
CREATE INDEX suppliers_tin_idx ON suppliers(tin) WHERE tin IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- PURCHASE ORDERS
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE purchase_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  po_number           varchar(30)    NOT NULL,
  po_date             date           NOT NULL,
  purchase_request_id uuid           NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  supplier_id         uuid           NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  contract_amount     decimal(18,2)  NOT NULL,
  award_date          date,
  award_notice_number varchar(50),
  mode_of_procurement varchar(100),
  delivery_terms      text,
  payment_terms       text,
  status              purchase_order_status NOT NULL DEFAULT 'draft',
  approved_by         uuid           REFERENCES users(id) ON DELETE SET NULL,
  approved_at         timestamptz(6),
  remarks             text,
  created_at          timestamptz(6) NOT NULL DEFAULT now(),
  updated_at          timestamptz(6) NOT NULL DEFAULT now(),
  created_by          uuid           REFERENCES users(id) ON DELETE SET NULL,
  updated_by          uuid           REFERENCES users(id) ON DELETE SET NULL,
  version             int            NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX purchase_orders_org_number_key ON purchase_orders(organization_id, po_number);
CREATE INDEX purchase_orders_org_idx ON purchase_orders(organization_id);
CREATE INDEX purchase_orders_pr_idx ON purchase_orders(purchase_request_id);
CREATE INDEX purchase_orders_supplier_idx ON purchase_orders(supplier_id);
CREATE INDEX purchase_orders_status_idx ON purchase_orders(status);

-- ════════════════════════════════════════════════════════════════════
-- CERTIFICATIONS OF AVAILABILITY (CAF)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE certifications_of_availability (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  caf_number               varchar(30)    NOT NULL,
  certification_date       date,
  purchase_request_id      uuid           NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  purchase_order_id        uuid           REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  supplier_id              uuid           REFERENCES suppliers(id) ON DELETE RESTRICT,
  budget_reservation_id    uuid           REFERENCES budget_reservations(id) ON DELETE RESTRICT,
  budget_release_id        uuid           NOT NULL REFERENCES budget_releases(id) ON DELETE RESTRICT,
  budget_line_id           uuid           REFERENCES budget_lines(id) ON DELETE SET NULL,
  fiscal_year_id           uuid           NOT NULL REFERENCES fiscal_years(id) ON DELETE RESTRICT,
  fund_source_id           uuid           NOT NULL REFERENCES fund_sources(id) ON DELETE RESTRICT,
  responsibility_center_id uuid           NOT NULL REFERENCES responsibility_centers(id) ON DELETE RESTRICT,
  account_code             varchar(30),
  certified_amount         decimal(18,2)  NOT NULL,
  available_before         decimal(18,2)  NOT NULL,
  available_after          decimal(18,2)  NOT NULL,
  certified_by             uuid           REFERENCES users(id) ON DELETE SET NULL,
  certified_at             timestamptz(6),
  status                   caf_status     NOT NULL DEFAULT 'draft',
  remarks                  text,
  created_at               timestamptz(6) NOT NULL DEFAULT now(),
  updated_at               timestamptz(6) NOT NULL DEFAULT now(),
  created_by               uuid           REFERENCES users(id) ON DELETE SET NULL,
  updated_by               uuid           REFERENCES users(id) ON DELETE SET NULL,
  version                  int            NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX caf_org_number_key ON certifications_of_availability(organization_id, caf_number);
CREATE INDEX caf_org_idx ON certifications_of_availability(organization_id);
CREATE INDEX caf_pr_idx ON certifications_of_availability(purchase_request_id);
CREATE INDEX caf_po_idx ON certifications_of_availability(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX caf_supplier_idx ON certifications_of_availability(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX caf_release_idx ON certifications_of_availability(budget_release_id);
CREATE INDEX caf_fiscal_year_idx ON certifications_of_availability(fiscal_year_id);
CREATE INDEX caf_status_idx ON certifications_of_availability(status);

-- ════════════════════════════════════════════════════════════════════
-- OBLIGATION REQUESTS (ORS)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE obligation_requests (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  ors_number                      varchar(30)    NOT NULL,
  ors_date                        date           NOT NULL,
  caf_id                          uuid           NOT NULL REFERENCES certifications_of_availability(id) ON DELETE RESTRICT,
  purchase_request_id             uuid           NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  purchase_order_id               uuid           REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  supplier_id                     uuid           REFERENCES suppliers(id) ON DELETE RESTRICT,
  budget_release_id               uuid           NOT NULL REFERENCES budget_releases(id) ON DELETE RESTRICT,
  budget_line_id                  uuid           REFERENCES budget_lines(id) ON DELETE SET NULL,
  budget_reservation_id           uuid           REFERENCES budget_reservations(id) ON DELETE RESTRICT,
  fund_source_id                  uuid           NOT NULL REFERENCES fund_sources(id) ON DELETE RESTRICT,
  responsibility_center_id        uuid           NOT NULL REFERENCES responsibility_centers(id) ON DELETE RESTRICT,
  account_code                    varchar(30),
  original_amount                 decimal(18,2)  NOT NULL,
  adjustment_amount               decimal(18,2)  NOT NULL DEFAULT 0,
  adjusted_amount                 decimal(18,2)  NOT NULL,
  cumulative_payable              decimal(18,2)  NOT NULL DEFAULT 0,
  cumulative_paid                 decimal(18,2)  NOT NULL DEFAULT 0,
  remaining_unpaid                decimal(18,2)  NOT NULL,
  deobligated_amount              decimal(18,2)  NOT NULL DEFAULT 0,
  requesting_office_id            uuid           REFERENCES departments(id) ON DELETE SET NULL,
  requesting_office_certified_by  uuid           REFERENCES users(id) ON DELETE SET NULL,
  requesting_office_certified_at  timestamptz(6),
  budget_certified_by             uuid           REFERENCES users(id) ON DELETE SET NULL,
  budget_certified_at             timestamptz(6),
  obligation_posting_date         date,
  status                          ors_status     NOT NULL DEFAULT 'draft',
  remarks                         text,
  created_at                      timestamptz(6) NOT NULL DEFAULT now(),
  updated_at                      timestamptz(6) NOT NULL DEFAULT now(),
  created_by                      uuid           REFERENCES users(id) ON DELETE SET NULL,
  updated_by                      uuid           REFERENCES users(id) ON DELETE SET NULL,
  version                         int            NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX ors_org_number_key ON obligation_requests(organization_id, ors_number);
CREATE INDEX ors_org_idx ON obligation_requests(organization_id);
CREATE INDEX ors_caf_idx ON obligation_requests(caf_id);
CREATE INDEX ors_pr_idx ON obligation_requests(purchase_request_id);
CREATE INDEX ors_po_idx ON obligation_requests(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX ors_supplier_idx ON obligation_requests(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX ors_release_idx ON obligation_requests(budget_release_id);
CREATE INDEX ors_reservation_idx ON obligation_requests(budget_reservation_id) WHERE budget_reservation_id IS NOT NULL;
CREATE INDEX ors_status_idx ON obligation_requests(status);

-- ════════════════════════════════════════════════════════════════════
-- ORS CHILDREN (billing, inspection, DV, payment, etc.)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE ors_children (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ors_id           uuid           NOT NULL REFERENCES obligation_requests(id) ON DELETE RESTRICT,
  child_type       ors_child_type NOT NULL,
  reference_number varchar(50),
  child_date       date           NOT NULL,
  amount           decimal(18,2)  NOT NULL,
  description      text,
  certified_by     uuid           REFERENCES users(id) ON DELETE SET NULL,
  certified_at     timestamptz(6),
  status           varchar(30)    NOT NULL DEFAULT 'pending',
  remarks          text,
  created_at       timestamptz(6) NOT NULL DEFAULT now(),
  updated_at       timestamptz(6) NOT NULL DEFAULT now(),
  created_by       uuid           REFERENCES users(id) ON DELETE SET NULL,
  updated_by       uuid           REFERENCES users(id) ON DELETE SET NULL,
  version          int            NOT NULL DEFAULT 1
);

CREATE INDEX ors_children_ors_idx ON ors_children(ors_id);
CREATE INDEX ors_children_type_idx ON ors_children(child_type);
CREATE INDEX ors_children_status_idx ON ors_children(status);

-- ════════════════════════════════════════════════════════════════════
-- ORS ADJUSTMENTS (immutable transaction records)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE ors_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ors_id          uuid           NOT NULL REFERENCES obligation_requests(id) ON DELETE RESTRICT,
  adjustment_type varchar(50)    NOT NULL,
  signed_amount   decimal(18,2)  NOT NULL,
  reason          text           NOT NULL,
  caf_id          uuid           REFERENCES certifications_of_availability(id) ON DELETE RESTRICT,
  approved_by     uuid           REFERENCES users(id) ON DELETE SET NULL,
  approved_at     timestamptz(6),
  status          varchar(30)    NOT NULL DEFAULT 'pending',
  created_at      timestamptz(6) NOT NULL DEFAULT now(),
  created_by      uuid           REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX ors_adjustments_ors_idx ON ors_adjustments(ors_id);
CREATE INDEX ors_adjustments_caf_idx ON ors_adjustments(caf_id) WHERE caf_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- AUDIT LOG TRIGGERS on new tables
-- ════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_suppliers_audit
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_purchase_orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_caf_audit
  AFTER INSERT OR UPDATE OR DELETE ON certifications_of_availability
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_ors_audit
  AFTER INSERT OR UPDATE OR DELETE ON obligation_requests
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_ors_children_audit
  AFTER INSERT OR UPDATE OR DELETE ON ors_children
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ors_adjustments is immutable (append-only like budget_transaction_logs)
-- but we still track inserts for audit trail
CREATE TRIGGER trg_ors_adjustments_audit
  AFTER INSERT ON ors_adjustments
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
