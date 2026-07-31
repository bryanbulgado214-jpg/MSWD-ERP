-- Migration: add_budgeting_phase1
-- Adds: budget_cycles, budget_versions, budget_headers, budget_lines
-- Generated to exactly match apps/api/prisma/schema.prisma.
--
-- Scope note: this is Budgeting Phase 1 only, using the cycle → version
-- → header → line structure explicitly requested for this phase — a
-- different table set than budgeting.appropriations/allotment_releases/
-- obligation_requests described in docs/04_Database's approved
-- architecture (§9). See schema.prisma's "BUDGETING (Phase 1)" comment
-- block for the full reconciliation note.
--
-- Same application note as the Core Platform migration: applied here via
-- `psql` directly (not `prisma migrate dev`) because this sandbox cannot
-- reach binaries.prisma.sh. On a machine with normal internet access,
-- `npx prisma migrate dev` applies this file itself.

-- ════════════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE budget_cycle_status AS ENUM ('planning', 'active', 'closed');

CREATE TYPE budget_version_status AS ENUM ('draft', 'submitted', 'approved', 'superseded', 'rejected');

CREATE TYPE budget_header_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- ════════════════════════════════════════════════════════════════════
-- budget_cycles
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_cycles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  fiscal_year_id  uuid        NOT NULL REFERENCES fiscal_years (id) ON DELETE RESTRICT,
  code            varchar(20) NOT NULL,
  name            varchar(150) NOT NULL,
  status          budget_cycle_status NOT NULL DEFAULT 'planning',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  version         integer     NOT NULL DEFAULT 1,
  CONSTRAINT budget_cycles_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_budget_cycles_organization_id ON budget_cycles (organization_id);
CREATE INDEX idx_budget_cycles_fiscal_year_id ON budget_cycles (fiscal_year_id);

-- ════════════════════════════════════════════════════════════════════
-- budget_versions
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_cycle_id uuid    NOT NULL REFERENCES budget_cycles (id) ON DELETE RESTRICT,
  version_number  integer NOT NULL,
  name            varchar(150) NOT NULL,
  status          budget_version_status NOT NULL DEFAULT 'draft',
  is_current      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  version         integer NOT NULL DEFAULT 1,
  CONSTRAINT budget_versions_budget_cycle_id_version_number_key UNIQUE (budget_cycle_id, version_number)
);
CREATE INDEX idx_budget_versions_budget_cycle_id ON budget_versions (budget_cycle_id);

-- ════════════════════════════════════════════════════════════════════
-- budget_headers
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_headers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  budget_version_id        uuid NOT NULL REFERENCES budget_versions (id) ON DELETE RESTRICT,
  responsibility_center_id uuid NOT NULL REFERENCES responsibility_centers (id) ON DELETE RESTRICT,
  fund_source_id           uuid NOT NULL REFERENCES fund_sources (id) ON DELETE RESTRICT,
  currency_code            varchar(3) NOT NULL DEFAULT 'PHP',
  total_amount             numeric(18,2) NOT NULL DEFAULT 0,
  status                   budget_header_status NOT NULL DEFAULT 'draft',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  version                  integer NOT NULL DEFAULT 1,
  CONSTRAINT budget_headers_version_rc_fund_key
    UNIQUE (budget_version_id, responsibility_center_id, fund_source_id)
);
CREATE INDEX idx_budget_headers_organization_id ON budget_headers (organization_id);
CREATE INDEX idx_budget_headers_budget_version_id ON budget_headers (budget_version_id);
CREATE INDEX idx_budget_headers_responsibility_center_id ON budget_headers (responsibility_center_id);
CREATE INDEX idx_budget_headers_fund_source_id ON budget_headers (fund_source_id);

-- ════════════════════════════════════════════════════════════════════
-- budget_lines
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_header_id uuid NOT NULL REFERENCES budget_headers (id) ON DELETE CASCADE,
  account_code     varchar(30) NOT NULL,
  description      text,
  amount           numeric(18,2) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX idx_budget_lines_budget_header_id ON budget_lines (budget_header_id);
CREATE INDEX idx_budget_lines_account_code ON budget_lines (account_code);

-- ════════════════════════════════════════════════════════════════════
-- Attach the existing audit-log trigger (fn_audit_log, created in the
-- Core Platform migration) to all 4 new tables.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_cycles', 'budget_versions', 'budget_headers', 'budget_lines']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION fn_audit_log();', t
    );
  END LOOP;
END $$;
