-- ────────────────────────────────────────────────────────────────────
-- Inventory: FIFO cost layers + stock-card-personnel month-end GL run
--
-- Adds per-item FIFO cost layers (perpetual valuation, oldest-first
-- consumption), a month-end inventory GL run (the RSMI issuance JEV the
-- stock-card personnel triggers), a gl_run_id marker on stock card entries so
-- issuances can be journalized in a monthly batch, and the reconciled
-- inventory permission codes (old catalog didn't match the controllers).
-- ────────────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE "inventory_layer_source" AS ENUM ('stock_receipt', 'beginning_balance', 'return_entry');
CREATE TYPE "inventory_gl_run_status" AS ENUM ('draft', 'posted', 'voided');

-- ────────────────────────────────────────────────────────────────────
-- inventory_cost_layers (FIFO)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE "inventory_cost_layers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "source_type" "inventory_layer_source" NOT NULL,
    "source_id" UUID,
    "reference_number" VARCHAR(50),
    "layer_date" DATE NOT NULL,
    "original_quantity" DECIMAL(12,4) NOT NULL,
    "remaining_quantity" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "inventory_cost_layers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_cost_layers_organization_id_idx" ON "inventory_cost_layers"("organization_id");
CREATE INDEX "inventory_cost_layers_inventory_item_id_layer_date_idx" ON "inventory_cost_layers"("inventory_item_id", "layer_date");

ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────
-- inventory_gl_runs (month-end RSMI issuance JEV)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE "inventory_gl_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "run_number" VARCHAR(30) NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "status" "inventory_gl_run_status" NOT NULL DEFAULT 'draft',
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "issue_count" INTEGER NOT NULL DEFAULT 0,
    "jev_id" UUID,
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "inventory_gl_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_gl_runs_organization_id_period_month_period_year_key" ON "inventory_gl_runs"("organization_id", "period_month", "period_year");
CREATE INDEX "inventory_gl_runs_organization_id_idx" ON "inventory_gl_runs"("organization_id");
CREATE INDEX "inventory_gl_runs_organization_id_status_idx" ON "inventory_gl_runs"("organization_id", "status");

ALTER TABLE "inventory_gl_runs" ADD CONSTRAINT "inventory_gl_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_gl_runs" ADD CONSTRAINT "inventory_gl_runs_jev_id_fkey" FOREIGN KEY ("jev_id") REFERENCES "journal_entry_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_gl_runs" ADD CONSTRAINT "inventory_gl_runs_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_gl_runs" ADD CONSTRAINT "inventory_gl_runs_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_gl_runs" ADD CONSTRAINT "inventory_gl_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────
-- inventory_gl_run_items (per-account totals behind the summary JEV)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE "inventory_gl_run_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inventory_gl_run_id" UUID NOT NULL,
    "chart_of_account_id" UUID NOT NULL,
    "side" VARCHAR(6) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_gl_run_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_gl_run_items_inventory_gl_run_id_idx" ON "inventory_gl_run_items"("inventory_gl_run_id");

ALTER TABLE "inventory_gl_run_items" ADD CONSTRAINT "inventory_gl_run_items_inventory_gl_run_id_fkey" FOREIGN KEY ("inventory_gl_run_id") REFERENCES "inventory_gl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_gl_run_items" ADD CONSTRAINT "inventory_gl_run_items_chart_of_account_id_fkey" FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────
-- stock_card_entries: link an issue entry to the month-end run
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE "stock_card_entries" ADD COLUMN "gl_run_id" UUID;
CREATE INDEX "stock_card_entries_gl_run_id_idx" ON "stock_card_entries"("gl_run_id");
ALTER TABLE "stock_card_entries" ADD CONSTRAINT "stock_card_entries_gl_run_id_fkey" FOREIGN KEY ("gl_run_id") REFERENCES "inventory_gl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────
-- AUDIT TRIGGERS (reuse existing fn_audit_log)
-- ────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_inventory_cost_layers_audit
  AFTER INSERT OR UPDATE OR DELETE ON inventory_cost_layers
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_inventory_gl_runs_audit
  AFTER INSERT OR UPDATE OR DELETE ON inventory_gl_runs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ────────────────────────────────────────────────────────────────────
-- PERMISSIONS — reconcile the catalog with the inventory controllers, plus
-- the new month-end GL and Supplies Ledger Card codes. Global (no org).
-- ────────────────────────────────────────────────────────────────────
INSERT INTO permissions (id, code, name, module) VALUES
  (gen_random_uuid(), 'inventory.reports', 'Inventory Reports', 'inventory'),
  (gen_random_uuid(), 'inventory.receipt.manage', 'Record Stock Receipts', 'inventory'),
  (gen_random_uuid(), 'inventory.ris.manage', 'Create/Manage RIS', 'inventory'),
  (gen_random_uuid(), 'inventory.ris.issue', 'Issue Stock via RIS', 'inventory'),
  (gen_random_uuid(), 'inventory.property.manage', 'Manage Property Records', 'inventory'),
  (gen_random_uuid(), 'inventory.accountability.manage', 'Manage PAR/ICS Accountability', 'inventory'),
  (gen_random_uuid(), 'inventory.physical_count.manage', 'Manage Physical Counts', 'inventory'),
  (gen_random_uuid(), 'inventory.physical_count.approve', 'Approve Physical Counts', 'inventory'),
  (gen_random_uuid(), 'inventory.dispose.manage', 'Manage Disposal/WMR', 'inventory'),
  (gen_random_uuid(), 'inventory.dispose.appraise', 'Appraise Disposal/WMR', 'inventory'),
  (gen_random_uuid(), 'inventory.dispose.approve', 'Approve Disposal/WMR', 'inventory'),
  (gen_random_uuid(), 'inventory.gl.post', 'Post Month-End Inventory JEV', 'inventory'),
  (gen_random_uuid(), 'accounting.supply_ledger.read', 'View Supplies Ledger Card', 'accounting'),
  (gen_random_uuid(), 'accounting.supply_ledger.manage', 'Maintain Supplies Ledger Card', 'accounting')
ON CONFLICT (code) DO NOTHING;
