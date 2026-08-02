-- ============================================================
-- Billing & Collections Module
-- ============================================================

-- 1. Enums
CREATE TYPE "consumer_type" AS ENUM (
  'residential',
  'commercial',
  'industrial',
  'government',
  'bulk'
);

CREATE TYPE "consumer_status" AS ENUM (
  'active',
  'disconnected',
  'inactive',
  'closed'
);

CREATE TYPE "meter_status" AS ENUM (
  'active',
  'retired',
  'condemned'
);

CREATE TYPE "meter_size" AS ENUM (
  'half_inch',
  'three_quarter_inch',
  'one_inch',
  'one_and_half_inch',
  'two_inch',
  'three_inch',
  'four_inch'
);

CREATE TYPE "billing_period_status" AS ENUM (
  'open',
  'reading',
  'billing',
  'closed'
);

CREATE TYPE "reading_status" AS ENUM (
  'pending',
  'confirmed',
  'adjusted'
);

CREATE TYPE "bill_status" AS ENUM (
  'unpaid',
  'partial',
  'paid',
  'cancelled',
  'written_off'
);

CREATE TYPE "payment_method" AS ENUM (
  'cash',
  'check',
  'online',
  'bank_deposit'
);

CREATE TYPE "payment_status" AS ENUM (
  'valid',
  'voided'
);

CREATE TYPE "charge_type" AS ENUM (
  'water',
  'environmental',
  'sewer',
  'maintenance',
  'penalty',
  'senior_discount',
  'pwd_discount',
  'adjustment',
  'arrears',
  'reconnection',
  'other'
);

CREATE TYPE "disconnection_status" AS ENUM (
  'notice_issued',
  'served',
  'disconnected',
  'cancelled',
  'reconnected'
);

-- 2. Consumers
CREATE TABLE "consumers" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "account_number"    VARCHAR(20) NOT NULL,
  "first_name"        VARCHAR(100) NOT NULL,
  "middle_name"       VARCHAR(100),
  "last_name"         VARCHAR(100) NOT NULL,
  "business_name"     VARCHAR(255),
  "consumer_type"     "consumer_type" NOT NULL DEFAULT 'residential',
  "address"           TEXT NOT NULL,
  "barangay"          VARCHAR(100),
  "municipality"      VARCHAR(100) DEFAULT 'Siquijor',
  "province"          VARCHAR(100) DEFAULT 'Siquijor',
  "contact_number"    VARCHAR(20),
  "email"             VARCHAR(255),
  "is_senior_citizen" BOOLEAN NOT NULL DEFAULT false,
  "is_pwd"            BOOLEAN NOT NULL DEFAULT false,
  "status"            "consumer_status" NOT NULL DEFAULT 'active',
  "connection_date"   DATE,
  "disconnection_date" DATE,
  "notes"             TEXT,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"        UUID,
  "updated_by"        UUID,
  "version"           INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "consumers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "consumers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "consumers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "consumers_organization_id_account_number_key" ON "consumers"("organization_id", "account_number");
CREATE INDEX "consumers_organization_id_idx" ON "consumers"("organization_id");
CREATE INDEX "consumers_status_idx" ON "consumers"("status");
CREATE INDEX "consumers_consumer_type_idx" ON "consumers"("consumer_type");
CREATE INDEX "consumers_last_name_idx" ON "consumers"("last_name");
CREATE INDEX "consumers_barangay_idx" ON "consumers"("barangay");

-- 3. Meters
CREATE TABLE "meters" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "serial_number"     VARCHAR(50) NOT NULL,
  "brand"             VARCHAR(100),
  "size"              "meter_size" NOT NULL DEFAULT 'half_inch',
  "status"            "meter_status" NOT NULL DEFAULT 'active',
  "initial_reading"   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes"             TEXT,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"        UUID,
  "updated_by"        UUID,

  CONSTRAINT "meters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "meters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "meters_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "meters_organization_id_serial_number_key" ON "meters"("organization_id", "serial_number");
CREATE INDEX "meters_organization_id_idx" ON "meters"("organization_id");
CREATE INDEX "meters_status_idx" ON "meters"("status");

-- 4. Consumer-Meter assignments (history)
CREATE TABLE "consumer_meters" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "consumer_id"         UUID NOT NULL,
  "meter_id"            UUID NOT NULL,
  "installed_date"      DATE NOT NULL,
  "removed_date"        DATE,
  "is_current"          BOOLEAN NOT NULL DEFAULT true,
  "installation_remarks" TEXT,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "consumer_meters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consumer_meters_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE CASCADE,
  CONSTRAINT "consumer_meters_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE RESTRICT
);

CREATE INDEX "consumer_meters_consumer_id_idx" ON "consumer_meters"("consumer_id");
CREATE INDEX "consumer_meters_meter_id_idx" ON "consumer_meters"("meter_id");
CREATE UNIQUE INDEX "consumer_meters_consumer_id_is_current_key" ON "consumer_meters"("consumer_id") WHERE "is_current" = true;

-- 5. Rate Schedules
CREATE TABLE "rate_schedules" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"     UUID NOT NULL,
  "name"                VARCHAR(100) NOT NULL,
  "consumer_type"       "consumer_type" NOT NULL,
  "effective_date"      DATE NOT NULL,
  "end_date"            DATE,
  "minimum_charge"      DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "minimum_consumption" DECIMAL(12, 2) NOT NULL DEFAULT 10,
  "environmental_fee"   DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "sewer_charge"        DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "maintenance_fee"     DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"          UUID,
  "updated_by"          UUID,
  "version"             INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "rate_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rate_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "rate_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "rate_schedules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "rate_schedules_organization_id_idx" ON "rate_schedules"("organization_id");
CREATE INDEX "rate_schedules_consumer_type_idx" ON "rate_schedules"("consumer_type");
CREATE INDEX "rate_schedules_is_active_idx" ON "rate_schedules"("is_active");

-- 6. Rate Tiers (block pricing within a rate schedule)
CREATE TABLE "rate_tiers" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "rate_schedule_id"      UUID NOT NULL,
  "min_consumption"       DECIMAL(12, 2) NOT NULL,
  "max_consumption"       DECIMAL(12, 2),
  "rate_per_cubic_meter"  DECIMAL(18, 4) NOT NULL,
  "sort_order"            INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "rate_tiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rate_tiers_rate_schedule_id_fkey" FOREIGN KEY ("rate_schedule_id") REFERENCES "rate_schedules"("id") ON DELETE CASCADE
);

CREATE INDEX "rate_tiers_rate_schedule_id_idx" ON "rate_tiers"("rate_schedule_id");

-- 7. Billing Periods
CREATE TABLE "billing_periods" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "name"              VARCHAR(50) NOT NULL,
  "billing_month"     INTEGER NOT NULL,
  "billing_year"      INTEGER NOT NULL,
  "reading_start_date" DATE,
  "reading_end_date"  DATE,
  "due_date"          DATE NOT NULL,
  "penalty_date"      DATE NOT NULL,
  "status"            "billing_period_status" NOT NULL DEFAULT 'open',
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"        UUID,
  "updated_by"        UUID,
  "version"           INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "billing_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "billing_periods_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "billing_periods_organization_id_month_year_key" ON "billing_periods"("organization_id", "billing_month", "billing_year");
CREATE INDEX "billing_periods_organization_id_idx" ON "billing_periods"("organization_id");
CREATE INDEX "billing_periods_status_idx" ON "billing_periods"("status");

-- 8. Meter Readings
CREATE TABLE "meter_readings" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "consumer_id"       UUID NOT NULL,
  "meter_id"          UUID NOT NULL,
  "billing_period_id" UUID NOT NULL,
  "reading_date"      DATE NOT NULL,
  "previous_reading"  DECIMAL(12, 2) NOT NULL,
  "current_reading"   DECIMAL(12, 2) NOT NULL,
  "consumption"       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "status"            "reading_status" NOT NULL DEFAULT 'pending',
  "remarks"           TEXT,
  "reader_id"         UUID,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"        UUID,
  "updated_by"        UUID,

  CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meter_readings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "meter_readings_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT,
  CONSTRAINT "meter_readings_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE RESTRICT,
  CONSTRAINT "meter_readings_billing_period_id_fkey" FOREIGN KEY ("billing_period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT,
  CONSTRAINT "meter_readings_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "meter_readings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "meter_readings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "meter_readings_consumer_id_billing_period_id_key" ON "meter_readings"("consumer_id", "billing_period_id");
CREATE INDEX "meter_readings_organization_id_idx" ON "meter_readings"("organization_id");
CREATE INDEX "meter_readings_consumer_id_idx" ON "meter_readings"("consumer_id");
CREATE INDEX "meter_readings_billing_period_id_idx" ON "meter_readings"("billing_period_id");
CREATE INDEX "meter_readings_status_idx" ON "meter_readings"("status");

-- 9. Bills
CREATE TABLE "bills" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"    UUID NOT NULL,
  "bill_number"        VARCHAR(20) NOT NULL,
  "consumer_id"        UUID NOT NULL,
  "billing_period_id"  UUID NOT NULL,
  "meter_reading_id"   UUID,
  "previous_reading"   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "current_reading"    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "consumption"        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "water_charge"       DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "environmental_fee"  DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "sewer_charge"       DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "maintenance_fee"    DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "penalty_amount"     DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "discount_amount"    DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "arrears_amount"     DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "other_charges"      DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "total_amount"       DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "amount_paid"        DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "balance"            DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "due_date"           DATE NOT NULL,
  "penalty_date"       DATE NOT NULL,
  "status"             "bill_status" NOT NULL DEFAULT 'unpaid',
  "is_senior_discount" BOOLEAN NOT NULL DEFAULT false,
  "is_pwd_discount"    BOOLEAN NOT NULL DEFAULT false,
  "discount_percentage" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "notes"              TEXT,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"         UUID,
  "updated_by"         UUID,
  "version"            INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "bills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "bills_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT,
  CONSTRAINT "bills_billing_period_id_fkey" FOREIGN KEY ("billing_period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT,
  CONSTRAINT "bills_meter_reading_id_fkey" FOREIGN KEY ("meter_reading_id") REFERENCES "meter_readings"("id") ON DELETE SET NULL,
  CONSTRAINT "bills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "bills_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "bills_organization_id_bill_number_key" ON "bills"("organization_id", "bill_number");
CREATE UNIQUE INDEX "bills_consumer_id_billing_period_id_key" ON "bills"("consumer_id", "billing_period_id");
CREATE INDEX "bills_organization_id_idx" ON "bills"("organization_id");
CREATE INDEX "bills_consumer_id_idx" ON "bills"("consumer_id");
CREATE INDEX "bills_billing_period_id_idx" ON "bills"("billing_period_id");
CREATE INDEX "bills_status_idx" ON "bills"("status");
CREATE INDEX "bills_due_date_idx" ON "bills"("due_date");

-- 10. Bill Charges (line items)
CREATE TABLE "bill_charges" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "bill_id"     UUID NOT NULL,
  "charge_type" "charge_type" NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "amount"      DECIMAL(18, 2) NOT NULL,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "bill_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bill_charges_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE
);

CREATE INDEX "bill_charges_bill_id_idx" ON "bill_charges"("bill_id");

-- 11. Payments
CREATE TABLE "payments" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "or_number"         VARCHAR(20) NOT NULL,
  "consumer_id"       UUID NOT NULL,
  "payment_date"      DATE NOT NULL,
  "total_amount"      DECIMAL(18, 2) NOT NULL,
  "payment_method"    "payment_method" NOT NULL DEFAULT 'cash',
  "check_number"      VARCHAR(50),
  "check_date"        DATE,
  "bank_name"         VARCHAR(100),
  "reference_number"  VARCHAR(100),
  "remarks"           TEXT,
  "status"            "payment_status" NOT NULL DEFAULT 'valid',
  "cashier_id"        UUID,
  "voided_at"         TIMESTAMPTZ(6),
  "voided_by"         UUID,
  "void_reason"       TEXT,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"        UUID,
  "updated_by"        UUID,
  "version"           INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "payments_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT,
  CONSTRAINT "payments_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "payments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "payments_organization_id_or_number_key" ON "payments"("organization_id", "or_number");
CREATE INDEX "payments_organization_id_idx" ON "payments"("organization_id");
CREATE INDEX "payments_consumer_id_idx" ON "payments"("consumer_id");
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- 12. Payment Allocations (which bills a payment covers)
CREATE TABLE "payment_allocations" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_id"      UUID NOT NULL,
  "bill_id"         UUID NOT NULL,
  "amount_applied"  DECIMAL(18, 2) NOT NULL,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE,
  CONSTRAINT "payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT
);

CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");
CREATE INDEX "payment_allocations_bill_id_idx" ON "payment_allocations"("bill_id");

-- 13. Disconnection Orders
CREATE TABLE "disconnection_orders" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"     UUID NOT NULL,
  "consumer_id"         UUID NOT NULL,
  "order_number"        VARCHAR(20) NOT NULL,
  "notice_date"         DATE NOT NULL,
  "scheduled_date"      DATE NOT NULL,
  "total_arrears"       DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "status"              "disconnection_status" NOT NULL DEFAULT 'notice_issued',
  "served_date"         DATE,
  "served_by"           UUID,
  "disconnected_date"   DATE,
  "disconnected_by"     UUID,
  "reconnected_date"    DATE,
  "reconnected_by"      UUID,
  "reconnection_fee"    DECIMAL(18, 2),
  "cancelled_date"      DATE,
  "cancelled_by"        UUID,
  "cancel_reason"       TEXT,
  "remarks"             TEXT,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by"          UUID,
  "updated_by"          UUID,
  "version"             INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "disconnection_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "disconnection_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "disconnection_orders_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT,
  CONSTRAINT "disconnection_orders_served_by_fkey" FOREIGN KEY ("served_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "disconnection_orders_disconnected_by_fkey" FOREIGN KEY ("disconnected_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "disconnection_orders_reconnected_by_fkey" FOREIGN KEY ("reconnected_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "disconnection_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "disconnection_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "disconnection_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "disconnection_orders_organization_id_order_number_key" ON "disconnection_orders"("organization_id", "order_number");
CREATE INDEX "disconnection_orders_organization_id_idx" ON "disconnection_orders"("organization_id");
CREATE INDEX "disconnection_orders_consumer_id_idx" ON "disconnection_orders"("consumer_id");
CREATE INDEX "disconnection_orders_status_idx" ON "disconnection_orders"("status");

-- 14. Audit triggers
CREATE TRIGGER "trg_consumers_audit" AFTER INSERT OR UPDATE OR DELETE ON "consumers"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER "trg_meters_audit" AFTER INSERT OR UPDATE OR DELETE ON "meters"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER "trg_meter_readings_audit" AFTER INSERT OR UPDATE OR DELETE ON "meter_readings"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER "trg_bills_audit" AFTER INSERT OR UPDATE OR DELETE ON "bills"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER "trg_payments_audit" AFTER INSERT OR UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER "trg_disconnection_orders_audit" AFTER INSERT OR UPDATE OR DELETE ON "disconnection_orders"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
