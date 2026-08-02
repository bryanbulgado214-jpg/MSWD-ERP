-- Accounting / General Ledger Module
-- Implements UACS-compliant Chart of Accounts, Journal Entry Vouchers,
-- Bank/Check lifecycle, and Bank Reconciliation per GAM standards.

-- ════════════════════════════════════════════════════════════════════
-- 1. ENUM TYPES
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE "account_type" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE "normal_balance" AS ENUM ('debit', 'credit');
CREATE TYPE "bank_account_type" AS ENUM ('checking', 'savings', 'trust');
CREATE TYPE "bank_account_status" AS ENUM ('active', 'inactive', 'closed');
CREATE TYPE "jev_status" AS ENUM ('draft', 'for_review', 'posted', 'voided');
CREATE TYPE "jev_source_type" AS ENUM ('manual', 'obligation', 'disbursement', 'stock_receipt', 'stock_issue', 'adjustment', 'closing');
CREATE TYPE "check_status" AS ENUM ('assigned', 'printed', 'released', 'cleared', 'stale_dated', 'spoiled', 'voided');
CREATE TYPE "bank_reconciliation_status" AS ENUM ('draft', 'in_progress', 'completed', 'approved');
CREATE TYPE "reconciliation_item_type" AS ENUM ('deposit_in_transit', 'outstanding_check', 'bank_charge', 'bank_credit', 'book_error', 'bank_error');

-- ════════════════════════════════════════════════════════════════════
-- 2. ALTER EXISTING TABLES
-- ════════════════════════════════════════════════════════════════════

-- FiscalYear: add close tracking
ALTER TABLE "fiscal_years" ADD COLUMN "closed_at" TIMESTAMPTZ(6);
ALTER TABLE "fiscal_years" ADD COLUMN "closed_by" UUID;
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_closed_by_fkey"
    FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AccountingPeriod: add lock tracking
ALTER TABLE "accounting_periods" ADD COLUMN "locked_at" TIMESTAMPTZ(6);
ALTER TABLE "accounting_periods" ADD COLUMN "locked_by" UUID;
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_locked_by_fkey"
    FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- 3. NEW TABLES
-- ════════════════════════════════════════════════════════════════════

-- Chart of Accounts (UACS-compliant hierarchy)
CREATE TABLE "chart_of_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "parent_account_id" UUID,
    "account_code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "account_type" "account_type" NOT NULL,
    "normal_balance" "normal_balance" NOT NULL,
    "level" SMALLINT NOT NULL,
    "is_header" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "uacs_code" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- Banks
CREATE TABLE "banks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "branch" VARCHAR(255),
    "swift_code" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- Bank Accounts
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "fund_source_id" UUID,
    "account_number" VARCHAR(50) NOT NULL,
    "account_name" VARCHAR(255) NOT NULL,
    "account_type" "bank_account_type" NOT NULL,
    "current_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "bank_account_status" NOT NULL DEFAULT 'active',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- Account Mappings
CREATE TABLE "account_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "mapping_key" VARCHAR(100) NOT NULL,
    "chart_of_account_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

-- Journal Entry Vouchers
CREATE TABLE "journal_entry_vouchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "jev_number" VARCHAR(30) NOT NULL,
    "jev_date" DATE NOT NULL,
    "accounting_period_id" UUID NOT NULL,
    "source_type" "jev_source_type" NOT NULL,
    "source_table" VARCHAR(100),
    "source_id" UUID,
    "particulars" TEXT NOT NULL,
    "responsibility_center_id" UUID,
    "fund_source_id" UUID,
    "total_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "jev_status" NOT NULL DEFAULT 'draft',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "journal_entry_vouchers_pkey" PRIMARY KEY ("id")
);

-- JEV Lines
CREATE TABLE "jev_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jev_id" UUID NOT NULL,
    "chart_of_account_id" UUID NOT NULL,
    "debit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "subsidiary_ref" VARCHAR(255),
    "subsidiary_ref_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jev_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "jev_lines_single_side_chk" CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (debit_amount = 0 AND credit_amount > 0)
    )
);

-- Checks
CREATE TABLE "checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "disbursement_voucher_id" UUID,
    "bank_account_id" UUID NOT NULL,
    "check_number" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "check_date" DATE NOT NULL,
    "payee_name" VARCHAR(255) NOT NULL,
    "status" "check_status" NOT NULL DEFAULT 'assigned',
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(6),
    "cleared_date" DATE,
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- Check Status History
CREATE TABLE "check_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "from_status" "check_status",
    "to_status" "check_status" NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    CONSTRAINT "check_status_history_pkey" PRIMARY KEY ("id")
);

-- Bank Reconciliations
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "accounting_period_id" UUID NOT NULL,
    "reconciliation_date" DATE NOT NULL,
    "book_balance" DECIMAL(18,2) NOT NULL,
    "bank_balance" DECIMAL(18,2) NOT NULL,
    "adjusted_book_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjusted_bank_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "bank_reconciliation_status" NOT NULL DEFAULT 'draft',
    "prepared_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- Bank Reconciliation Items
CREATE TABLE "bank_reconciliation_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_reconciliation_id" UUID NOT NULL,
    "item_type" "reconciliation_item_type" NOT NULL,
    "reference_number" VARCHAR(50),
    "reference_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "check_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- ════════════════════════════════════════════════════════════════════
-- 4. UNIQUE CONSTRAINTS
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_organization_id_account_code_key"
    UNIQUE ("organization_id", "account_code");

ALTER TABLE "banks" ADD CONSTRAINT "banks_organization_id_code_key"
    UNIQUE ("organization_id", "code");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_account_number_key"
    UNIQUE ("organization_id", "account_number");

ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_organization_id_mapping_key_key"
    UNIQUE ("organization_id", "mapping_key");

ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_organization_id_jev_number_key"
    UNIQUE ("organization_id", "jev_number");

ALTER TABLE "checks" ADD CONSTRAINT "checks_organization_id_check_number_bank_account_id_key"
    UNIQUE ("organization_id", "check_number", "bank_account_id");

ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_org_bank_period_key"
    UNIQUE ("organization_id", "bank_account_id", "accounting_period_id");

-- ════════════════════════════════════════════════════════════════════
-- 5. FOREIGN KEYS
-- ════════════════════════════════════════════════════════════════════

-- chart_of_accounts
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_account_id_fkey"
    FOREIGN KEY ("parent_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- banks
ALTER TABLE "banks" ADD CONSTRAINT "banks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- bank_accounts
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_bank_id_fkey"
    FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_fund_source_id_fkey"
    FOREIGN KEY ("fund_source_id") REFERENCES "fund_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- account_mappings
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_chart_of_account_id_fkey"
    FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- journal_entry_vouchers
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_accounting_period_id_fkey"
    FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_responsibility_center_id_fkey"
    FOREIGN KEY ("responsibility_center_id") REFERENCES "responsibility_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_fund_source_id_fkey"
    FOREIGN KEY ("fund_source_id") REFERENCES "fund_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_posted_by_fkey"
    FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_voided_by_fkey"
    FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entry_vouchers" ADD CONSTRAINT "journal_entry_vouchers_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- jev_lines
ALTER TABLE "jev_lines" ADD CONSTRAINT "jev_lines_jev_id_fkey"
    FOREIGN KEY ("jev_id") REFERENCES "journal_entry_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jev_lines" ADD CONSTRAINT "jev_lines_chart_of_account_id_fkey"
    FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- checks
ALTER TABLE "checks" ADD CONSTRAINT "checks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checks" ADD CONSTRAINT "checks_disbursement_voucher_id_fkey"
    FOREIGN KEY ("disbursement_voucher_id") REFERENCES "disbursement_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checks" ADD CONSTRAINT "checks_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checks" ADD CONSTRAINT "checks_released_by_fkey"
    FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checks" ADD CONSTRAINT "checks_voided_by_fkey"
    FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checks" ADD CONSTRAINT "checks_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checks" ADD CONSTRAINT "checks_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- check_status_history
ALTER TABLE "check_status_history" ADD CONSTRAINT "check_status_history_check_id_fkey"
    FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_status_history" ADD CONSTRAINT "check_status_history_changed_by_fkey"
    FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- bank_reconciliations
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_accounting_period_id_fkey"
    FOREIGN KEY ("accounting_period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_prepared_by_fkey"
    FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- bank_reconciliation_items
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_bank_reconciliation_id_fkey"
    FOREIGN KEY ("bank_reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_check_id_fkey"
    FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- 6. INDEXES
-- ════════════════════════════════════════════════════════════════════

-- chart_of_accounts
CREATE INDEX "chart_of_accounts_organization_id_idx" ON "chart_of_accounts"("organization_id");
CREATE INDEX "chart_of_accounts_parent_account_id_idx" ON "chart_of_accounts"("parent_account_id");
CREATE INDEX "chart_of_accounts_account_type_idx" ON "chart_of_accounts"("account_type");
CREATE INDEX "chart_of_accounts_is_active_idx" ON "chart_of_accounts"("is_active");

-- banks
CREATE INDEX "banks_organization_id_idx" ON "banks"("organization_id");

-- bank_accounts
CREATE INDEX "bank_accounts_organization_id_idx" ON "bank_accounts"("organization_id");
CREATE INDEX "bank_accounts_bank_id_idx" ON "bank_accounts"("bank_id");
CREATE INDEX "bank_accounts_fund_source_id_idx" ON "bank_accounts"("fund_source_id");
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts"("status");

-- account_mappings
CREATE INDEX "account_mappings_organization_id_idx" ON "account_mappings"("organization_id");
CREATE INDEX "account_mappings_chart_of_account_id_idx" ON "account_mappings"("chart_of_account_id");

-- journal_entry_vouchers
CREATE INDEX "journal_entry_vouchers_organization_id_idx" ON "journal_entry_vouchers"("organization_id");
CREATE INDEX "journal_entry_vouchers_accounting_period_id_idx" ON "journal_entry_vouchers"("accounting_period_id");
CREATE INDEX "journal_entry_vouchers_source_type_idx" ON "journal_entry_vouchers"("source_type");
CREATE INDEX "journal_entry_vouchers_source_table_source_id_idx" ON "journal_entry_vouchers"("source_table", "source_id");
CREATE INDEX "journal_entry_vouchers_status_idx" ON "journal_entry_vouchers"("status");

-- jev_lines
CREATE INDEX "jev_lines_jev_id_idx" ON "jev_lines"("jev_id");
CREATE INDEX "jev_lines_chart_of_account_id_idx" ON "jev_lines"("chart_of_account_id");

-- checks
CREATE INDEX "checks_organization_id_idx" ON "checks"("organization_id");
CREATE INDEX "checks_disbursement_voucher_id_idx" ON "checks"("disbursement_voucher_id");
CREATE INDEX "checks_bank_account_id_idx" ON "checks"("bank_account_id");
CREATE INDEX "checks_status_idx" ON "checks"("status");

-- check_status_history
CREATE INDEX "check_status_history_check_id_idx" ON "check_status_history"("check_id");

-- bank_reconciliations
CREATE INDEX "bank_reconciliations_organization_id_idx" ON "bank_reconciliations"("organization_id");
CREATE INDEX "bank_reconciliations_bank_account_id_idx" ON "bank_reconciliations"("bank_account_id");
CREATE INDEX "bank_reconciliations_accounting_period_id_idx" ON "bank_reconciliations"("accounting_period_id");
CREATE INDEX "bank_reconciliations_status_idx" ON "bank_reconciliations"("status");

-- bank_reconciliation_items
CREATE INDEX "bank_reconciliation_items_bank_reconciliation_id_idx" ON "bank_reconciliation_items"("bank_reconciliation_id");
CREATE INDEX "bank_reconciliation_items_check_id_idx" ON "bank_reconciliation_items"("check_id");

-- ════════════════════════════════════════════════════════════════════
-- 7. AUDIT TRIGGERS
-- ════════════════════════════════════════════════════════════════════
-- Reuse the existing fn_audit_log() function from the core
-- platform migration.

CREATE TRIGGER audit_chart_of_accounts
    AFTER INSERT OR UPDATE OR DELETE ON "chart_of_accounts"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_banks
    AFTER INSERT OR UPDATE OR DELETE ON "banks"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_bank_accounts
    AFTER INSERT OR UPDATE OR DELETE ON "bank_accounts"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_account_mappings
    AFTER INSERT OR UPDATE OR DELETE ON "account_mappings"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_journal_entry_vouchers
    AFTER INSERT OR UPDATE OR DELETE ON "journal_entry_vouchers"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_jev_lines
    AFTER INSERT OR UPDATE OR DELETE ON "jev_lines"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_checks
    AFTER INSERT OR UPDATE OR DELETE ON "checks"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_bank_reconciliations
    AFTER INSERT OR UPDATE OR DELETE ON "bank_reconciliations"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER audit_bank_reconciliation_items
    AFTER INSERT OR UPDATE OR DELETE ON "bank_reconciliation_items"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
