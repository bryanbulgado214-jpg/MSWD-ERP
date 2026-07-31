-- Procurement Phase 2: Purchase Requests
--
-- Adds purchase_request_status enum, purchase_requests table, and
-- purchase_request_items table. Budget integration uses the existing
-- budget_reservations system via subject_table/subject_id.

-- CreateEnum
CREATE TYPE "purchase_request_status" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');

-- CreateTable: purchase_requests
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pr_number" VARCHAR(30) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "budget_release_id" UUID NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "purchase_request_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: purchase_request_items
CREATE TABLE "purchase_request_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_request_id" UUID NOT NULL,
    "item_number" SMALLINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_of_measure" VARCHAR(20) NOT NULL,
    "estimated_unit_cost" DECIMAL(18,2) NOT NULL,
    "estimated_total_cost" DECIMAL(18,2) NOT NULL,
    "account_code" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_organization_id_pr_number_key" ON "purchase_requests"("organization_id", "pr_number");
CREATE INDEX "purchase_requests_organization_id_idx" ON "purchase_requests"("organization_id");
CREATE INDEX "purchase_requests_budget_release_id_idx" ON "purchase_requests"("budget_release_id");
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

CREATE UNIQUE INDEX "purchase_request_items_purchase_request_id_item_number_key" ON "purchase_request_items"("purchase_request_id", "item_number");
CREATE INDEX "purchase_request_items_purchase_request_id_idx" ON "purchase_request_items"("purchase_request_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_budget_release_id_fkey" FOREIGN KEY ("budget_release_id") REFERENCES "budget_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
