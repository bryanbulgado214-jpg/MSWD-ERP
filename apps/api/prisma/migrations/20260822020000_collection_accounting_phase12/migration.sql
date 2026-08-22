-- CreateEnum
CREATE TYPE "collection_nature" AS ENUM ('receivable_settlement', 'income', 'liability');

-- CreateEnum
CREATE TYPE "teller_session_status" AS ENUM ('open', 'closed', 'remitted', 'accepted');

-- CreateEnum
CREATE TYPE "collection_batch_status" AS ENUM ('open', 'closed', 'for_review', 'reviewed', 'approved', 'posted', 'rejected', 'reversed');

-- CreateEnum
CREATE TYPE "deposit_status" AS ENUM ('not_deposited', 'partially_deposited', 'fully_deposited', 'verified');

-- AlterTable: payments allow non-consumer collections + session/batch links
ALTER TABLE "payments" ALTER COLUMN "consumer_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "payer_name" VARCHAR(150);
ALTER TABLE "payments" ADD COLUMN "application_ref" VARCHAR(50);
ALTER TABLE "payments" ADD COLUMN "teller_session_id" UUID;
ALTER TABLE "payments" ADD COLUMN "collection_batch_id" UUID;
CREATE INDEX "payments_teller_session_id_idx" ON "payments"("teller_session_id");
CREATE INDEX "payments_collection_batch_id_idx" ON "payments"("collection_batch_id");

-- AlterTable: payment_allocations may settle a bill or a collection type
ALTER TABLE "payment_allocations" ALTER COLUMN "bill_id" DROP NOT NULL;
ALTER TABLE "payment_allocations" ADD COLUMN "collection_type_id" UUID;
CREATE INDEX "payment_allocations_collection_type_id_idx" ON "payment_allocations"("collection_type_id");

-- CreateTable
CREATE TABLE "collection_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nature" "collection_nature" NOT NULL,
    "gl_account_id" UUID,
    "requires_consumer" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "collection_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_types_organization_id_code_key" ON "collection_types"("organization_id", "code");
CREATE INDEX "collection_types_organization_id_idx" ON "collection_types"("organization_id");

-- CreateTable
CREATE TABLE "teller_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "teller_id" UUID NOT NULL,
    "session_number" VARCHAR(30) NOT NULL,
    "collection_date" DATE NOT NULL,
    "status" "teller_session_status" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "beginning_or_number" VARCHAR(20),
    "ending_or_number" VARCHAR(20),
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "cash_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "check_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "electronic_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_collections" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "voided_receipt_count" INTEGER NOT NULL DEFAULT 0,
    "expected_remittance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actual_cash_remitted" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actual_checks_remitted" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_actual_remittance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "shortage_overage" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remitted_at" TIMESTAMPTZ(6),
    "received_by_cashier_id" UUID,
    "received_at" TIMESTAMPTZ(6),
    "collection_batch_id" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teller_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teller_sessions_organization_id_session_number_key" ON "teller_sessions"("organization_id", "session_number");
CREATE INDEX "teller_sessions_organization_id_idx" ON "teller_sessions"("organization_id");
CREATE INDEX "teller_sessions_teller_id_idx" ON "teller_sessions"("teller_id");
CREATE INDEX "teller_sessions_collection_date_idx" ON "teller_sessions"("collection_date");
CREATE INDEX "teller_sessions_status_idx" ON "teller_sessions"("status");

-- CreateTable
CREATE TABLE "collection_accounting_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "batch_number" VARCHAR(30) NOT NULL,
    "collection_date" DATE NOT NULL,
    "cashier_id" UUID NOT NULL,
    "status" "collection_batch_status" NOT NULL DEFAULT 'open',
    "beginning_or_number" VARCHAR(20),
    "ending_or_number" VARCHAR(20),
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "gross_collections" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cash_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "check_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bank_transfer_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "online_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_collections" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "voided_receipt_count" INTEGER NOT NULL DEFAULT 0,
    "prepared_by" UUID,
    "prepared_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(6),
    "jev_id" UUID,
    "rejected_reason" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_accounting_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_accounting_batches_organization_id_batch_number_key" ON "collection_accounting_batches"("organization_id", "batch_number");
CREATE INDEX "collection_accounting_batches_organization_id_idx" ON "collection_accounting_batches"("organization_id");
CREATE INDEX "collection_accounting_batches_cashier_id_idx" ON "collection_accounting_batches"("cashier_id");
CREATE INDEX "collection_accounting_batches_collection_date_idx" ON "collection_accounting_batches"("collection_date");
CREATE INDEX "collection_accounting_batches_status_idx" ON "collection_accounting_batches"("status");

-- CreateTable
CREATE TABLE "collection_deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "collection_batch_id" UUID,
    "bank_account_id" UUID,
    "deposit_slip_number" VARCHAR(50),
    "deposit_date" DATE NOT NULL,
    "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "verified_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bank_reference" VARCHAR(100),
    "deposited_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "status" "deposit_status" NOT NULL DEFAULT 'not_deposited',
    "jev_id" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_deposits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collection_deposits_organization_id_idx" ON "collection_deposits"("organization_id");
CREATE INDEX "collection_deposits_collection_batch_id_idx" ON "collection_deposits"("collection_batch_id");
CREATE INDEX "collection_deposits_deposit_date_idx" ON "collection_deposits"("deposit_date");
CREATE INDEX "collection_deposits_status_idx" ON "collection_deposits"("status");
