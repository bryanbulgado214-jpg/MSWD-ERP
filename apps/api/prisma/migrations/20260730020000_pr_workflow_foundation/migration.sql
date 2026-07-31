-- PR Workflow Foundation
--
-- This migration adds the database objects needed for the comprehensive
-- Purchase Requisition workflow: new enums, PPMP/APP planning tables,
-- procurement categories, PR revision history, delegation authorities,
-- and expands the purchase_requests / purchase_request_items tables.
--
-- Enum values are added in separate DO blocks because Postgres cannot
-- add a new enum value and use it in a DEFAULT / column definition
-- within the same transaction.

-- ════════════════════════════════════════════════════════════════════
-- PART 1: NEW ENUMS
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE "procurement_category" AS ENUM (
  'goods',
  'services',
  'infrastructure',
  'consulting_services'
);

CREATE TYPE "item_classification" AS ENUM (
  'inventory',
  'asset',
  'expense',
  'infrastructure',
  'service'
);

CREATE TYPE "ppmp_status" AS ENUM (
  'draft',
  'approved',
  'cancelled'
);

CREATE TYPE "app_status" AS ENUM (
  'draft',
  'approved',
  'cancelled'
);

CREATE TYPE "delegation_status" AS ENUM (
  'active',
  'revoked',
  'expired'
);

-- ════════════════════════════════════════════════════════════════════
-- PART 2: EXPAND PurchaseRequestStatus ENUM
--
-- Each ALTER TYPE ... ADD VALUE must be in its own transaction or
-- outside a transaction block. Prisma runs each migration file as
-- a single transaction, but ALTER TYPE ... ADD VALUE is
-- special-cased by Postgres to work inside a transaction as of v12.
-- We add each value individually.
-- ════════════════════════════════════════════════════════════════════

ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'endorsed';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'budget_review';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'budget_certified';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'procurement_review';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'accepted_for_procurement';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'procurement_in_progress';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'awarded';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'po_issued';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'inspected';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'voided';

-- ════════════════════════════════════════════════════════════════════
-- PART 3: NEW TABLES
-- ════════════════════════════════════════════════════════════════════

-- 3a. Procurement Categories (lookup table)
CREATE TABLE "procurement_categories" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code"            VARCHAR(30) NOT NULL,
    "name"            VARCHAR(255) NOT NULL,
    "description"     TEXT,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procurement_categories_organization_id_code_key"
    ON "procurement_categories"("organization_id", "code");
CREATE INDEX "procurement_categories_organization_id_idx"
    ON "procurement_categories"("organization_id");

ALTER TABLE "procurement_categories"
    ADD CONSTRAINT "procurement_categories_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3b. PPMP Items (Project Procurement Management Plan entries)
CREATE TABLE "ppmp_items" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"     UUID NOT NULL,
    "fiscal_year_id"      UUID NOT NULL,
    "department_id"       UUID NOT NULL,
    "code"                VARCHAR(30) NOT NULL,
    "item_description"    TEXT NOT NULL,
    "procurement_category" "procurement_category" NOT NULL DEFAULT 'goods',
    "unit_of_measure"     VARCHAR(30) NOT NULL,
    "quantity"            DECIMAL(12,4) NOT NULL,
    "estimated_unit_cost" DECIMAL(18,2) NOT NULL,
    "estimated_total_cost" DECIMAL(18,2) NOT NULL,
    "status"              "ppmp_status" NOT NULL DEFAULT 'draft',
    "approved_by"         UUID,
    "approved_at"         TIMESTAMPTZ(6),
    "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"          UUID,
    "updated_by"          UUID,
    "version"             INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ppmp_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ppmp_items_organization_id_code_key"
    ON "ppmp_items"("organization_id", "code");
CREATE INDEX "ppmp_items_organization_id_idx"
    ON "ppmp_items"("organization_id");
CREATE INDEX "ppmp_items_fiscal_year_id_idx"
    ON "ppmp_items"("fiscal_year_id");
CREATE INDEX "ppmp_items_department_id_idx"
    ON "ppmp_items"("department_id");
CREATE INDEX "ppmp_items_status_idx"
    ON "ppmp_items"("status");

ALTER TABLE "ppmp_items"
    ADD CONSTRAINT "ppmp_items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppmp_items"
    ADD CONSTRAINT "ppmp_items_fiscal_year_id_fkey"
    FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppmp_items"
    ADD CONSTRAINT "ppmp_items_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ppmp_items"
    ADD CONSTRAINT "ppmp_items_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ppmp_items"
    ADD CONSTRAINT "ppmp_items_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ppmp_items"
    ADD CONSTRAINT "ppmp_items_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3c. APP Items (Annual Procurement Plan entries)
CREATE TABLE "app_items" (
    "id"                        UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"           UUID NOT NULL,
    "fiscal_year_id"            UUID NOT NULL,
    "ppmp_item_id"              UUID NOT NULL,
    "app_number"                VARCHAR(30) NOT NULL,
    "procurement_project_title" VARCHAR(500) NOT NULL,
    "procurement_category"      "procurement_category" NOT NULL DEFAULT 'goods',
    "approved_budget"           DECIMAL(18,2) NOT NULL,
    "procurement_mode"          VARCHAR(100),
    "schedule_month"            SMALLINT,
    "status"                    "app_status" NOT NULL DEFAULT 'draft',
    "created_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"                UUID,
    "updated_by"                UUID,
    "version"                   INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "app_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_items_organization_id_app_number_key"
    ON "app_items"("organization_id", "app_number");
CREATE INDEX "app_items_organization_id_idx"
    ON "app_items"("organization_id");
CREATE INDEX "app_items_fiscal_year_id_idx"
    ON "app_items"("fiscal_year_id");
CREATE INDEX "app_items_ppmp_item_id_idx"
    ON "app_items"("ppmp_item_id");
CREATE INDEX "app_items_status_idx"
    ON "app_items"("status");

ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_fiscal_year_id_fkey"
    FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_ppmp_item_id_fkey"
    FOREIGN KEY ("ppmp_item_id") REFERENCES "ppmp_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_items"
    ADD CONSTRAINT "app_items_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3d. PR Revisions (version snapshots)
CREATE TABLE "pr_revisions" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_request_id" UUID NOT NULL,
    "revision_number"     INTEGER NOT NULL,
    "snapshot_data"       JSONB NOT NULL,
    "reason"              TEXT,
    "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"          UUID,

    CONSTRAINT "pr_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pr_revisions_purchase_request_id_revision_number_key"
    ON "pr_revisions"("purchase_request_id", "revision_number");
CREATE INDEX "pr_revisions_purchase_request_id_idx"
    ON "pr_revisions"("purchase_request_id");

ALTER TABLE "pr_revisions"
    ADD CONSTRAINT "pr_revisions_purchase_request_id_fkey"
    FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pr_revisions"
    ADD CONSTRAINT "pr_revisions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3e. Delegation Authorities
CREATE TABLE "delegation_authorities" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"      UUID NOT NULL,
    "delegator_user_id"    UUID NOT NULL,
    "delegate_user_id"     UUID NOT NULL,
    "permission_code"      VARCHAR(100) NOT NULL,
    "effective_date"       DATE NOT NULL,
    "expiration_date"      DATE NOT NULL,
    "amount_limit"         DECIMAL(18,2),
    "scope_department_id"  UUID,
    "status"               "delegation_status" NOT NULL DEFAULT 'active',
    "remarks"              TEXT,
    "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"           UUID,
    "version"              INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "delegation_authorities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delegation_authorities_date_check" CHECK ("expiration_date" >= "effective_date"),
    CONSTRAINT "delegation_authorities_self_check" CHECK ("delegator_user_id" != "delegate_user_id")
);

CREATE INDEX "delegation_authorities_organization_id_idx"
    ON "delegation_authorities"("organization_id");
CREATE INDEX "delegation_authorities_delegator_user_id_idx"
    ON "delegation_authorities"("delegator_user_id");
CREATE INDEX "delegation_authorities_delegate_user_id_idx"
    ON "delegation_authorities"("delegate_user_id");
CREATE INDEX "delegation_authorities_permission_code_idx"
    ON "delegation_authorities"("permission_code");

ALTER TABLE "delegation_authorities"
    ADD CONSTRAINT "delegation_authorities_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delegation_authorities"
    ADD CONSTRAINT "delegation_authorities_delegator_user_id_fkey"
    FOREIGN KEY ("delegator_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delegation_authorities"
    ADD CONSTRAINT "delegation_authorities_delegate_user_id_fkey"
    FOREIGN KEY ("delegate_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delegation_authorities"
    ADD CONSTRAINT "delegation_authorities_scope_department_id_fkey"
    FOREIGN KEY ("scope_department_id") REFERENCES "departments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delegation_authorities"
    ADD CONSTRAINT "delegation_authorities_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- PART 4: ALTER EXISTING TABLES
-- ════════════════════════════════════════════════════════════════════

-- 4a. Make budget_release_id nullable (set at budget certification, not creation)
ALTER TABLE "purchase_requests"
    ALTER COLUMN "budget_release_id" DROP NOT NULL;

-- 4b. Add new columns to purchase_requests
ALTER TABLE "purchase_requests"
    ADD COLUMN "fiscal_year_id"          UUID,
    ADD COLUMN "department_id"           UUID,
    ADD COLUMN "department_head_id"      UUID,
    ADD COLUMN "purpose"                 TEXT,
    ADD COLUMN "procurement_category_id" UUID,
    ADD COLUMN "requested_delivery_date" DATE,
    ADD COLUMN "delivery_location_id"    UUID,
    ADD COLUMN "ppmp_item_id"            UUID,
    ADD COLUMN "app_item_id"             UUID,
    ADD COLUMN "budget_line_id"          UUID,
    ADD COLUMN "responsibility_center_id" UUID,
    ADD COLUMN "fund_source_id"          UUID,
    ADD COLUMN "revision_number"         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "budget_certified_by"     UUID,
    ADD COLUMN "budget_certified_at"     TIMESTAMPTZ(6),
    ADD COLUMN "approved_by"             UUID,
    ADD COLUMN "approved_at"             TIMESTAMPTZ(6),
    ADD COLUMN "endorsed_by"             UUID,
    ADD COLUMN "endorsed_at"             TIMESTAMPTZ(6);

-- 4c. Add indexes on new FK columns
CREATE INDEX "purchase_requests_fiscal_year_id_idx"
    ON "purchase_requests"("fiscal_year_id");
CREATE INDEX "purchase_requests_department_id_idx"
    ON "purchase_requests"("department_id");
CREATE INDEX "purchase_requests_ppmp_item_id_idx"
    ON "purchase_requests"("ppmp_item_id");
CREATE INDEX "purchase_requests_app_item_id_idx"
    ON "purchase_requests"("app_item_id");

-- 4d. Add foreign keys on new columns
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_fiscal_year_id_fkey"
    FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_department_head_id_fkey"
    FOREIGN KEY ("department_head_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_procurement_category_id_fkey"
    FOREIGN KEY ("procurement_category_id") REFERENCES "procurement_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_delivery_location_id_fkey"
    FOREIGN KEY ("delivery_location_id") REFERENCES "locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_ppmp_item_id_fkey"
    FOREIGN KEY ("ppmp_item_id") REFERENCES "ppmp_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_app_item_id_fkey"
    FOREIGN KEY ("app_item_id") REFERENCES "app_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_budget_line_id_fkey"
    FOREIGN KEY ("budget_line_id") REFERENCES "budget_lines"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_responsibility_center_id_fkey"
    FOREIGN KEY ("responsibility_center_id") REFERENCES "responsibility_centers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_fund_source_id_fkey"
    FOREIGN KEY ("fund_source_id") REFERENCES "fund_sources"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_budget_certified_by_fkey"
    FOREIGN KEY ("budget_certified_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_endorsed_by_fkey"
    FOREIGN KEY ("endorsed_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4e. Add new columns to purchase_request_items
ALTER TABLE "purchase_request_items"
    ADD COLUMN "technical_specification" TEXT,
    ADD COLUMN "classification"          "item_classification";

-- ════════════════════════════════════════════════════════════════════
-- PART 5: AUDIT TRIGGERS
--
-- Attach fn_audit_log() to all new tables AND to the procurement
-- tables that were missed in the previous migration.
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_categories',
    'ppmp_items',
    'app_items',
    'pr_revisions',
    'delegation_authorities',
    'purchase_requests',
    'purchase_request_items'
  ]
  LOOP
    -- Drop first in case it already exists (safe for re-runs)
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s', t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION fn_audit_log();', t
    );
  END LOOP;
END $$;
