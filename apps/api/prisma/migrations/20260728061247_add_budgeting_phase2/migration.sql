-- Migration: add_budgeting_phase2
-- Adds: budget_releases, budget_reservations, budget_transaction_logs
-- Generated to exactly match apps/api/prisma/schema.prisma.
--
-- Does NOT modify budget_cycles / budget_versions / budget_headers /
-- budget_lines in any way — no ALTER TABLE against those tables. The
-- corresponding schema.prisma change was a virtual relation field on
-- BudgetHeader (budgetReleases), which has no database column and
-- required no migration.
--
-- Same application note as prior migrations: applied via `psql` directly
-- in this sandbox because binaries.prisma.sh is unreachable here; on a
-- machine with normal internet access, `npx prisma migrate dev` applies
-- this file itself.

-- ════════════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE budget_release_status AS ENUM ('draft', 'released', 'cancelled');

CREATE TYPE budget_reservation_status AS ENUM ('active', 'released', 'cancelled');

CREATE TYPE budget_transaction_type AS ENUM (
  'release', 'reservation', 'reservation_release', 'reservation_cancellation', 'adjustment'
);

-- ════════════════════════════════════════════════════════════════════
-- budget_releases
--
-- available_amount is a GENERATED column: Postgres computes and stores
-- it from released_amount - reserved_amount, so it can never drift out
-- of sync with those two. The concurrency-safe budget check (architecture
-- §12) works by taking a row lock on this table
-- (SELECT ... FOR UPDATE WHERE id = :release_id) before reading
-- available_amount and updating reserved_amount — that lock, plus this
-- generated column, is the whole mechanism; no application code should
-- ever write to available_amount directly (it can't — Postgres rejects
-- writes to generated columns).
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_releases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  budget_header_id uuid NOT NULL REFERENCES budget_headers (id) ON DELETE RESTRICT,
  release_number   varchar(30) NOT NULL,
  release_date     date NOT NULL,
  released_amount  numeric(18,2) NOT NULL,
  reserved_amount  numeric(18,2) NOT NULL DEFAULT 0,
  available_amount numeric(18,2) GENERATED ALWAYS AS (released_amount - reserved_amount) STORED,
  status           budget_release_status NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  version          integer NOT NULL DEFAULT 1,
  CONSTRAINT budget_releases_organization_id_release_number_key UNIQUE (organization_id, release_number)
);
CREATE INDEX idx_budget_releases_organization_id ON budget_releases (organization_id);
CREATE INDEX idx_budget_releases_budget_header_id ON budget_releases (budget_header_id);

-- ════════════════════════════════════════════════════════════════════
-- budget_reservations
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  budget_release_id uuid NOT NULL REFERENCES budget_releases (id) ON DELETE RESTRICT,
  subject_table     varchar(100),
  subject_id        uuid,
  amount_reserved   numeric(18,2) NOT NULL,
  status            budget_reservation_status NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  version           integer NOT NULL DEFAULT 1
);
CREATE INDEX idx_budget_reservations_organization_id ON budget_reservations (organization_id);
CREATE INDEX idx_budget_reservations_budget_release_id ON budget_reservations (budget_release_id);
CREATE INDEX idx_budget_reservations_subject ON budget_reservations (subject_table, subject_id);

-- ════════════════════════════════════════════════════════════════════
-- budget_transaction_logs (append-only ledger)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE budget_transaction_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  budget_release_id     uuid NOT NULL REFERENCES budget_releases (id) ON DELETE RESTRICT,
  budget_reservation_id uuid REFERENCES budget_reservations (id) ON DELETE RESTRICT,
  transaction_type      budget_transaction_type NOT NULL,
  amount_signed         numeric(18,2) NOT NULL,
  remarks               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX idx_budget_transaction_logs_organization_id ON budget_transaction_logs (organization_id);
CREATE INDEX idx_budget_transaction_logs_budget_release_id ON budget_transaction_logs (budget_release_id);
CREATE INDEX idx_budget_transaction_logs_budget_reservation_id ON budget_transaction_logs (budget_reservation_id);

-- ════════════════════════════════════════════════════════════════════
-- Attach the existing audit-log trigger (fn_audit_log, created in the
-- Core Platform migration) to budget_releases and budget_reservations.
--
-- budget_transaction_logs is deliberately EXCLUDED: it is itself an
-- immutable ledger (same reasoning as core.audit_logs and
-- core.workflow_actions in the Core Platform migration) — double-logging
-- an already-immutable log table into audit_logs would be redundant.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_releases', 'budget_reservations']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION fn_audit_log();', t
    );
  END LOOP;
END $$;

-- Append-only enforcement on budget_transaction_logs. A dedicated
-- function (not a reuse of Core Platform's fn_prevent_audit_log_mutation,
-- which hardcodes "audit_logs" in its error message and belongs to that
-- earlier migration) so the error message correctly names whichever
-- table was actually touched.
CREATE OR REPLACE FUNCTION fn_prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_budget_transaction_logs_immutable
  BEFORE UPDATE OR DELETE ON budget_transaction_logs
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();
