-- ════════════════════════════════════════════════════════════════════
-- INVENTORY & PROPERTY MANAGEMENT MODULE
--
-- Creates all tables, enums, indexes, audit triggers, document
-- sequences, and permission seeds for the inventory module.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────────────

CREATE TYPE "inventory_classification" AS ENUM ('expendable', 'semi_expendable', 'ppe');
CREATE TYPE "stock_receipt_status" AS ENUM ('draft', 'received', 'cancelled');
CREATE TYPE "stock_card_entry_type" AS ENUM ('receipt', 'issue', 'return_entry', 'adjustment', 'beginning_balance');
CREATE TYPE "ris_status" AS ENUM ('draft', 'submitted', 'approved', 'issued', 'partially_issued', 'cancelled');
CREATE TYPE "accountability_type" AS ENUM ('par', 'ics');
CREATE TYPE "accountability_status" AS ENUM ('active', 'returned', 'transferred', 'disposed', 'lost');
CREATE TYPE "property_condition" AS ENUM ('brand_new', 'serviceable', 'unserviceable', 'poor', 'beyond_repair');
CREATE TYPE "physical_count_status" AS ENUM ('draft', 'in_progress', 'completed', 'approved');
CREATE TYPE "count_type" AS ENUM ('semi_annual_supplies', 'annual_ppe', 'annual_semi_expendable', 'spot_check');
CREATE TYPE "disposal_status" AS ENUM ('draft', 'for_appraisal', 'appraised', 'for_approval', 'approved', 'disposed', 'cancelled');
CREATE TYPE "disposal_method" AS ENUM ('public_auction', 'negotiated_sale', 'barter', 'donation', 'destruction', 'transfer_to_agency');

-- ────────────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────────────

-- inventory_items: Master catalog
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "item_code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "unit_of_measure" VARCHAR(30) NOT NULL,
    "classification" "inventory_classification" NOT NULL,
    "category" VARCHAR(100),
    "account_code" VARCHAR(30),
    "reorder_point" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "on_hand_quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- stock_receipts: Goods received
CREATE TABLE "stock_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "receipt_number" VARCHAR(30) NOT NULL,
    "receipt_date" DATE NOT NULL,
    "purchase_order_id" UUID,
    "inspection_report_id" UUID,
    "supplier_id" UUID,
    "status" "stock_receipt_status" NOT NULL DEFAULT 'draft',
    "received_by" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- stock_receipt_items: Line items of receipt
CREATE TABLE "stock_receipt_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stock_receipt_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity_received" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,
    "lot_number" VARCHAR(50),
    "expiry_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipt_items_pkey" PRIMARY KEY ("id")
);

-- stock_cards: One per inventory item (Appendix 58)
CREATE TABLE "stock_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "stock_number" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "reorder_point" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit_of_measure" VARCHAR(30) NOT NULL,
    "balance_quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "balance_unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance_total_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_cards_pkey" PRIMARY KEY ("id")
);

-- stock_card_entries: Individual entries on a stock card
CREATE TABLE "stock_card_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stock_card_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "entry_type" "stock_card_entry_type" NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "reference_number" VARCHAR(50),
    "receipt_quantity" DECIMAL(12,4),
    "receipt_unit_cost" DECIMAL(18,2),
    "receipt_total_cost" DECIMAL(18,2),
    "issue_quantity" DECIMAL(12,4),
    "issue_unit_cost" DECIMAL(18,2),
    "issue_total_cost" DECIMAL(18,2),
    "balance_quantity" DECIMAL(12,4) NOT NULL,
    "balance_unit_cost" DECIMAL(18,2) NOT NULL,
    "balance_total_cost" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "stock_card_entries_pkey" PRIMARY KEY ("id")
);

-- requisition_issue_slips: RIS (Appendix 63)
CREATE TABLE "requisition_issue_slips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "ris_number" VARCHAR(30) NOT NULL,
    "ris_date" DATE NOT NULL,
    "requesting_department_id" UUID NOT NULL,
    "purpose" TEXT,
    "status" "ris_status" NOT NULL DEFAULT 'draft',
    "requested_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6),
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "requisition_issue_slips_pkey" PRIMARY KEY ("id")
);

-- ris_items: Line items of an RIS
CREATE TABLE "ris_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ris_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "stock_number" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "unit_of_measure" VARCHAR(30) NOT NULL,
    "quantity_requested" DECIMAL(12,4) NOT NULL,
    "quantity_issued" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ris_items_pkey" PRIMARY KEY ("id")
);

-- property_records: Individual PPE/semi-expendable items
CREATE TABLE "property_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "stock_receipt_item_id" UUID,
    "property_number" VARCHAR(50) NOT NULL,
    "serial_number" VARCHAR(100),
    "description" VARCHAR(500) NOT NULL,
    "date_acquired" DATE NOT NULL,
    "acquisition_cost" DECIMAL(18,2) NOT NULL,
    "estimated_useful_life" INTEGER,
    "salvage_value" DECIMAL(18,2),
    "monthly_depreciation" DECIMAL(18,2),
    "accumulated_depreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "book_value" DECIMAL(18,2),
    "condition" "property_condition" NOT NULL DEFAULT 'brand_new',
    "location_id" UUID,
    "accountable_user_id" UUID,
    "is_disposed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "property_records_pkey" PRIMARY KEY ("id")
);

-- accountability_records: PAR and ICS headers
CREATE TABLE "accountability_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "accountability_type" "accountability_type" NOT NULL,
    "accountability_number" VARCHAR(30) NOT NULL,
    "issued_to_user_id" UUID NOT NULL,
    "issued_date" DATE NOT NULL,
    "return_date" DATE,
    "status" "accountability_status" NOT NULL DEFAULT 'active',
    "par_renewal_date" DATE,
    "issued_by" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "accountability_records_pkey" PRIMARY KEY ("id")
);

-- accountability_record_items: Line items on PAR/ICS
CREATE TABLE "accountability_record_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountability_record_id" UUID NOT NULL,
    "property_record_id" UUID NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountability_record_items_pkey" PRIMARY KEY ("id")
);

-- physical_counts: Physical count events
CREATE TABLE "physical_counts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "count_number" VARCHAR(30) NOT NULL,
    "count_date" DATE NOT NULL,
    "count_type" "count_type" NOT NULL,
    "fiscal_year_id" UUID,
    "status" "physical_count_status" NOT NULL DEFAULT 'draft',
    "counted_by" UUID,
    "verified_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "physical_counts_pkey" PRIMARY KEY ("id")
);

-- physical_count_items: Individual items counted
CREATE TABLE "physical_count_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "physical_count_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "property_record_id" UUID,
    "on_hand_per_count" DECIMAL(12,4) NOT NULL,
    "on_hand_per_card" DECIMAL(12,4) NOT NULL,
    "quantity_variance" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "total_variance_cost" DECIMAL(18,2) NOT NULL,
    "condition" "property_condition",
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_count_items_pkey" PRIMARY KEY ("id")
);

-- disposal_requests: Waste Materials Report / Disposal
CREATE TABLE "disposal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_number" VARCHAR(30) NOT NULL,
    "request_date" DATE NOT NULL,
    "status" "disposal_status" NOT NULL DEFAULT 'draft',
    "disposal_method" "disposal_method",
    "total_appraised" DECIMAL(18,2),
    "requested_by" UUID,
    "appraised_by" UUID,
    "appraised_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "disposed_at" TIMESTAMPTZ(6),
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "disposal_requests_pkey" PRIMARY KEY ("id")
);

-- disposal_request_items: Items in a disposal request
CREATE TABLE "disposal_request_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "disposal_request_id" UUID NOT NULL,
    "property_record_id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unit_of_measure" VARCHAR(30) NOT NULL,
    "condition" "property_condition" NOT NULL,
    "appraised_value" DECIMAL(18,2),
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disposal_request_items_pkey" PRIMARY KEY ("id")
);

-- ────────────────────────────────────────────────────────────────────
-- UNIQUE CONSTRAINTS
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organization_id_item_code_key" UNIQUE ("organization_id", "item_code");
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_organization_id_receipt_number_key" UNIQUE ("organization_id", "receipt_number");
ALTER TABLE "stock_cards" ADD CONSTRAINT "stock_cards_inventory_item_id_key" UNIQUE ("inventory_item_id");
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_organization_id_ris_number_key" UNIQUE ("organization_id", "ris_number");
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_organization_id_property_number_key" UNIQUE ("organization_id", "property_number");
ALTER TABLE "accountability_records" ADD CONSTRAINT "accountability_records_organization_id_accountability_number_key" UNIQUE ("organization_id", "accountability_number");
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_organization_id_count_number_key" UNIQUE ("organization_id", "count_number");
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_organization_id_request_number_key" UNIQUE ("organization_id", "request_number");

-- ────────────────────────────────────────────────────────────────────
-- FOREIGN KEYS
-- ────────────────────────────────────────────────────────────────────

-- inventory_items
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_receipts
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_inspection_report_id_fkey" FOREIGN KEY ("inspection_report_id") REFERENCES "inspection_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_receipt_items
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_stock_receipt_id_fkey" FOREIGN KEY ("stock_receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- stock_cards
ALTER TABLE "stock_cards" ADD CONSTRAINT "stock_cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_cards" ADD CONSTRAINT "stock_cards_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- stock_card_entries
ALTER TABLE "stock_card_entries" ADD CONSTRAINT "stock_card_entries_stock_card_id_fkey" FOREIGN KEY ("stock_card_id") REFERENCES "stock_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_card_entries" ADD CONSTRAINT "stock_card_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- requisition_issue_slips
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_requesting_department_id_fkey" FOREIGN KEY ("requesting_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requisition_issue_slips" ADD CONSTRAINT "requisition_issue_slips_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ris_items
ALTER TABLE "ris_items" ADD CONSTRAINT "ris_items_ris_id_fkey" FOREIGN KEY ("ris_id") REFERENCES "requisition_issue_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ris_items" ADD CONSTRAINT "ris_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- property_records
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_stock_receipt_item_id_fkey" FOREIGN KEY ("stock_receipt_item_id") REFERENCES "stock_receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_accountable_user_id_fkey" FOREIGN KEY ("accountable_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_records" ADD CONSTRAINT "property_records_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- accountability_records
ALTER TABLE "accountability_records" ADD CONSTRAINT "accountability_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accountability_records" ADD CONSTRAINT "accountability_records_issued_to_user_id_fkey" FOREIGN KEY ("issued_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accountability_records" ADD CONSTRAINT "accountability_records_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accountability_records" ADD CONSTRAINT "accountability_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accountability_records" ADD CONSTRAINT "accountability_records_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- accountability_record_items
ALTER TABLE "accountability_record_items" ADD CONSTRAINT "accountability_record_items_accountability_record_id_fkey" FOREIGN KEY ("accountability_record_id") REFERENCES "accountability_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accountability_record_items" ADD CONSTRAINT "accountability_record_items_property_record_id_fkey" FOREIGN KEY ("property_record_id") REFERENCES "property_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- physical_counts
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- physical_count_items
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_physical_count_id_fkey" FOREIGN KEY ("physical_count_id") REFERENCES "physical_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_property_record_id_fkey" FOREIGN KEY ("property_record_id") REFERENCES "property_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- disposal_requests
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_appraised_by_fkey" FOREIGN KEY ("appraised_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disposal_requests" ADD CONSTRAINT "disposal_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- disposal_request_items
ALTER TABLE "disposal_request_items" ADD CONSTRAINT "disposal_request_items_disposal_request_id_fkey" FOREIGN KEY ("disposal_request_id") REFERENCES "disposal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disposal_request_items" ADD CONSTRAINT "disposal_request_items_property_record_id_fkey" FOREIGN KEY ("property_record_id") REFERENCES "property_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────────────

-- inventory_items
CREATE INDEX "inventory_items_organization_id_idx" ON "inventory_items"("organization_id");
CREATE INDEX "inventory_items_classification_idx" ON "inventory_items"("classification");
CREATE INDEX "inventory_items_is_active_idx" ON "inventory_items"("is_active");

-- stock_receipts
CREATE INDEX "stock_receipts_organization_id_idx" ON "stock_receipts"("organization_id");
CREATE INDEX "stock_receipts_purchase_order_id_idx" ON "stock_receipts"("purchase_order_id");
CREATE INDEX "stock_receipts_inspection_report_id_idx" ON "stock_receipts"("inspection_report_id");
CREATE INDEX "stock_receipts_status_idx" ON "stock_receipts"("status");

-- stock_receipt_items
CREATE INDEX "stock_receipt_items_stock_receipt_id_idx" ON "stock_receipt_items"("stock_receipt_id");
CREATE INDEX "stock_receipt_items_inventory_item_id_idx" ON "stock_receipt_items"("inventory_item_id");

-- stock_cards
CREATE INDEX "stock_cards_organization_id_idx" ON "stock_cards"("organization_id");

-- stock_card_entries
CREATE INDEX "stock_card_entries_stock_card_id_idx" ON "stock_card_entries"("stock_card_id");
CREATE INDEX "stock_card_entries_entry_date_idx" ON "stock_card_entries"("entry_date");
CREATE INDEX "stock_card_entries_reference_type_reference_id_idx" ON "stock_card_entries"("reference_type", "reference_id");

-- requisition_issue_slips
CREATE INDEX "requisition_issue_slips_organization_id_idx" ON "requisition_issue_slips"("organization_id");
CREATE INDEX "requisition_issue_slips_requesting_department_id_idx" ON "requisition_issue_slips"("requesting_department_id");
CREATE INDEX "requisition_issue_slips_status_idx" ON "requisition_issue_slips"("status");

-- ris_items
CREATE INDEX "ris_items_ris_id_idx" ON "ris_items"("ris_id");
CREATE INDEX "ris_items_inventory_item_id_idx" ON "ris_items"("inventory_item_id");

-- property_records
CREATE INDEX "property_records_organization_id_idx" ON "property_records"("organization_id");
CREATE INDEX "property_records_inventory_item_id_idx" ON "property_records"("inventory_item_id");
CREATE INDEX "property_records_accountable_user_id_idx" ON "property_records"("accountable_user_id");
CREATE INDEX "property_records_location_id_idx" ON "property_records"("location_id");
CREATE INDEX "property_records_condition_idx" ON "property_records"("condition");
CREATE INDEX "property_records_is_disposed_idx" ON "property_records"("is_disposed");

-- accountability_records
CREATE INDEX "accountability_records_organization_id_idx" ON "accountability_records"("organization_id");
CREATE INDEX "accountability_records_issued_to_user_id_idx" ON "accountability_records"("issued_to_user_id");
CREATE INDEX "accountability_records_accountability_type_idx" ON "accountability_records"("accountability_type");
CREATE INDEX "accountability_records_status_idx" ON "accountability_records"("status");

-- accountability_record_items
CREATE INDEX "accountability_record_items_accountability_record_id_idx" ON "accountability_record_items"("accountability_record_id");
CREATE INDEX "accountability_record_items_property_record_id_idx" ON "accountability_record_items"("property_record_id");

-- physical_counts
CREATE INDEX "physical_counts_organization_id_idx" ON "physical_counts"("organization_id");
CREATE INDEX "physical_counts_count_type_idx" ON "physical_counts"("count_type");
CREATE INDEX "physical_counts_status_idx" ON "physical_counts"("status");

-- physical_count_items
CREATE INDEX "physical_count_items_physical_count_id_idx" ON "physical_count_items"("physical_count_id");
CREATE INDEX "physical_count_items_inventory_item_id_idx" ON "physical_count_items"("inventory_item_id");

-- disposal_requests
CREATE INDEX "disposal_requests_organization_id_idx" ON "disposal_requests"("organization_id");
CREATE INDEX "disposal_requests_status_idx" ON "disposal_requests"("status");

-- disposal_request_items
CREATE INDEX "disposal_request_items_disposal_request_id_idx" ON "disposal_request_items"("disposal_request_id");
CREATE INDEX "disposal_request_items_property_record_id_idx" ON "disposal_request_items"("property_record_id");

-- ────────────────────────────────────────────────────────────────────
-- AUDIT TRIGGERS (reuse existing fn_audit_log)
-- ────────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_inventory_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_stock_receipts_audit
  AFTER INSERT OR UPDATE OR DELETE ON stock_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_stock_cards_audit
  AFTER INSERT OR UPDATE OR DELETE ON stock_cards
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- stock_card_entries is append-only (ledger), track inserts only
CREATE TRIGGER trg_stock_card_entries_audit
  AFTER INSERT ON stock_card_entries
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_requisition_issue_slips_audit
  AFTER INSERT OR UPDATE OR DELETE ON requisition_issue_slips
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_property_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON property_records
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_accountability_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON accountability_records
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_physical_counts_audit
  AFTER INSERT OR UPDATE OR DELETE ON physical_counts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_disposal_requests_audit
  AFTER INSERT OR UPDATE OR DELETE ON disposal_requests
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ────────────────────────────────────────────────────────────────────
-- DOCUMENT SEQUENCES
-- ────────────────────────────────────────────────────────────────────

INSERT INTO document_sequences (id, organization_id, document_type, prefix, next_number, padding)
SELECT gen_random_uuid(), o.id, dt.type, dt.prefix, 1, 6
FROM organizations o
CROSS JOIN (VALUES
  ('stock_receipt', 'SR-'),
  ('ris', 'RIS-'),
  ('par', 'PAR-'),
  ('ics', 'ICS-'),
  ('physical_count', 'PC-'),
  ('disposal_request', 'WMR-'),
  ('property_record', 'PROP-')
) AS dt(type, prefix)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- PERMISSIONS
-- ────────────────────────────────────────────────────────────────────

INSERT INTO permissions (id, code, name, module) VALUES
  (gen_random_uuid(), 'inventory.read', 'View Inventory Data', 'inventory'),
  (gen_random_uuid(), 'inventory.item.manage', 'Manage Inventory Items', 'inventory'),
  (gen_random_uuid(), 'inventory.receive', 'Receive Stock', 'inventory'),
  (gen_random_uuid(), 'inventory.issue', 'Issue Stock via RIS', 'inventory'),
  (gen_random_uuid(), 'inventory.ris.approve', 'Approve RIS', 'inventory'),
  (gen_random_uuid(), 'inventory.stock_card', 'View/Manage Stock Cards', 'inventory'),
  (gen_random_uuid(), 'inventory.par', 'Issue/Manage PAR', 'inventory'),
  (gen_random_uuid(), 'inventory.ics', 'Issue/Manage ICS', 'inventory'),
  (gen_random_uuid(), 'inventory.property_card', 'View/Manage Property Records', 'inventory'),
  (gen_random_uuid(), 'inventory.transfer', 'Transfer Property', 'inventory'),
  (gen_random_uuid(), 'inventory.request', 'Request Supplies (RIS)', 'inventory'),
  (gen_random_uuid(), 'inventory.acknowledge', 'Acknowledge Property Receipt', 'inventory'),
  (gen_random_uuid(), 'inventory.physical_count', 'Conduct Physical Count', 'inventory'),
  (gen_random_uuid(), 'inventory.physical_count.approve', 'Approve Physical Count', 'inventory'),
  (gen_random_uuid(), 'inventory.dispose.request', 'Request Disposal', 'inventory'),
  (gen_random_uuid(), 'inventory.dispose.appraise', 'Appraise Items for Disposal', 'inventory'),
  (gen_random_uuid(), 'inventory.dispose.approve', 'Approve Disposal', 'inventory'),
  (gen_random_uuid(), 'inventory.ledger', 'View Inventory Ledger/Reports', 'inventory'),
  (gen_random_uuid(), 'inventory.reconcile', 'Reconcile Inventory', 'inventory')
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- ROLES
-- ────────────────────────────────────────────────────────────────────

-- Create new inventory roles per organization
INSERT INTO roles (id, organization_id, code, name, description, is_system_role)
SELECT gen_random_uuid(), o.id, r.code, r.name, r.description, true
FROM organizations o
CROSS JOIN (VALUES
  ('SUPPLY_OFFICER', 'Supply Officer', 'Manages inventory items, stock receipts, RIS approval, stock cards, PAR/ICS, and property records'),
  ('PROPERTY_CUSTODIAN', 'Property Custodian', 'Manages property records, PAR/ICS issuance, transfers, and physical counts'),
  ('INVENTORY_COMMITTEE', 'Inventory Committee', 'Conducts and approves physical counts, appraises items for disposal')
) AS r(code, name, description)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- ROLE-PERMISSION ASSIGNMENTS
-- ────────────────────────────────────────────────────────────────────

-- Supply Officer gets full operational inventory permissions
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'inventory.read',
  'inventory.item.manage',
  'inventory.receive',
  'inventory.issue',
  'inventory.ris.approve',
  'inventory.stock_card',
  'inventory.par',
  'inventory.ics',
  'inventory.property_card',
  'inventory.transfer',
  'inventory.physical_count',
  'inventory.ledger',
  'inventory.dispose.request'
)
WHERE r.code = 'SUPPLY_OFFICER'
ON CONFLICT DO NOTHING;

-- Property Custodian gets property-focused permissions
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'inventory.read',
  'inventory.property_card',
  'inventory.par',
  'inventory.ics',
  'inventory.transfer',
  'inventory.physical_count',
  'inventory.ledger'
)
WHERE r.code = 'PROPERTY_CUSTODIAN'
ON CONFLICT DO NOTHING;

-- Inventory Committee gets count and disposal permissions
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'inventory.read',
  'inventory.physical_count',
  'inventory.physical_count.approve',
  'inventory.dispose.appraise',
  'inventory.ledger'
)
WHERE r.code = 'INVENTORY_COMMITTEE'
ON CONFLICT DO NOTHING;

-- Admin role gets all inventory permissions (except approval-type ones)
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.module = 'inventory'
  AND p.code NOT IN (
    'inventory.ris.approve',
    'inventory.physical_count.approve',
    'inventory.dispose.approve',
    'inventory.dispose.appraise'
  )
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

-- General Manager gets approval permissions
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'inventory.read',
  'inventory.physical_count.approve',
  'inventory.dispose.approve',
  'inventory.reconcile',
  'inventory.ledger'
)
WHERE r.code = 'GENERAL_MANAGER'
ON CONFLICT DO NOTHING;

-- Department Head gets request and acknowledge permissions
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'inventory.read',
  'inventory.request',
  'inventory.acknowledge',
  'inventory.ledger'
)
WHERE r.code = 'DEPARTMENT_HEAD'
ON CONFLICT DO NOTHING;

-- End Users can request supplies and acknowledge property
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'inventory.read',
  'inventory.request',
  'inventory.acknowledge'
)
WHERE r.code = 'END_USER'
ON CONFLICT DO NOTHING;
