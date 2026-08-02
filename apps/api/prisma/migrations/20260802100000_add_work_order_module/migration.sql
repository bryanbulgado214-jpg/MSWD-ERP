-- CreateEnum
CREATE TYPE "work_order_type" AS ENUM ('installation', 'repair', 'replacement', 'disconnection', 'reconnection', 'inspection', 'maintenance');

-- CreateEnum
CREATE TYPE "work_order_priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "work_order_status" AS ENUM ('draft', 'pending', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled');

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "wo_number" VARCHAR(20) NOT NULL,
    "type" "work_order_type" NOT NULL,
    "priority" "work_order_priority" NOT NULL DEFAULT 'normal',
    "status" "work_order_status" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "consumer_id" UUID,
    "meter_id" UUID,
    "location" VARCHAR(500),
    "scheduled_date" DATE,
    "assigned_to" UUID,
    "assigned_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "completion_notes" TEXT,
    "estimated_duration_hrs" DECIMAL(6,2),
    "actual_duration_hrs" DECIMAL(6,2),
    "materials_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity_used" DECIMAL(12,4) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_orders_organization_id_idx" ON "work_orders"("organization_id");
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");
CREATE INDEX "work_orders_type_idx" ON "work_orders"("type");
CREATE INDEX "work_orders_assigned_to_idx" ON "work_orders"("assigned_to");
CREATE INDEX "work_orders_consumer_id_idx" ON "work_orders"("consumer_id");
CREATE INDEX "work_orders_scheduled_date_idx" ON "work_orders"("scheduled_date");
CREATE UNIQUE INDEX "work_orders_organization_id_wo_number_key" ON "work_orders"("organization_id", "wo_number");

-- CreateIndex
CREATE INDEX "work_order_materials_work_order_id_idx" ON "work_order_materials"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_notes_work_order_id_idx" ON "work_order_notes"("work_order_id");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_notes" ADD CONSTRAINT "work_order_notes_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_notes" ADD CONSTRAINT "work_order_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed Work Order permissions
INSERT INTO "permissions" ("id", "code", "name", "module", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'workorder.read', 'View Work Orders', 'workorder', NOW(), NOW()),
  (gen_random_uuid(), 'workorder.create', 'Create Work Orders', 'workorder', NOW(), NOW()),
  (gen_random_uuid(), 'workorder.assign', 'Assign Work Orders', 'workorder', NOW(), NOW()),
  (gen_random_uuid(), 'workorder.execute', 'Execute Work Orders', 'workorder', NOW(), NOW()),
  (gen_random_uuid(), 'workorder.verify', 'Verify Completed Work', 'workorder', NOW(), NOW()),
  (gen_random_uuid(), 'workorder.reports', 'View Work Order Reports', 'workorder', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Seed Work Order document sequence
INSERT INTO "document_sequences" ("id", "organization_id", "document_type", "prefix", "next_number", "padding", "created_at", "updated_at")
SELECT gen_random_uuid(), o.id, 'work_order', 'WO-', 1, 6, NOW(), NOW()
FROM "organizations" o
ON CONFLICT DO NOTHING;
