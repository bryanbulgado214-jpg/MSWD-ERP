-- Customer Service & Complaints module

-- ── Enums ──

CREATE TYPE "complaint_type" AS ENUM (
  'water_quality',
  'billing_dispute',
  'service_interruption',
  'leak_report',
  'meter_issue',
  'low_pressure',
  'no_water',
  'illegal_connection',
  'staff_conduct',
  'other'
);

CREATE TYPE "complaint_priority" AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE "complaint_status" AS ENUM (
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
  'reopened'
);

CREATE TYPE "complaint_resolution_type" AS ENUM (
  'fixed',
  'explained',
  'referred',
  'no_action_needed',
  'duplicate',
  'invalid'
);

-- ── Tables ──

CREATE TABLE "complaints" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "complaint_number"  VARCHAR(20) NOT NULL,
  "type"              "complaint_type" NOT NULL,
  "priority"          "complaint_priority" NOT NULL DEFAULT 'normal',
  "status"            "complaint_status" NOT NULL DEFAULT 'open',
  "subject"           VARCHAR(200) NOT NULL,
  "description"       TEXT NOT NULL,
  "location"          VARCHAR(300),
  "contact_name"      VARCHAR(150),
  "contact_phone"     VARCHAR(30),
  "contact_email"     VARCHAR(150),
  "consumer_id"       UUID,
  "assigned_to"       UUID,
  "assigned_at"       TIMESTAMPTZ(6),
  "resolution_type"   "complaint_resolution_type",
  "resolution_notes"  TEXT,
  "resolved_at"       TIMESTAMPTZ(6),
  "resolved_by"       UUID,
  "closed_at"         TIMESTAMPTZ(6),
  "closed_by"         UUID,
  "sla_due_at"        TIMESTAMPTZ(6),
  "work_order_id"     UUID,
  "version"           INTEGER NOT NULL DEFAULT 1,
  "created_by"        UUID,
  "updated_by"        UUID,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complaint_notes" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "complaint_id"   UUID NOT NULL,
  "note"           TEXT NOT NULL,
  "is_internal"    BOOLEAN NOT NULL DEFAULT false,
  "created_by"     UUID,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "complaint_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complaint_attachments" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "complaint_id"   UUID NOT NULL,
  "file_name"      VARCHAR(255) NOT NULL,
  "file_type"      VARCHAR(100),
  "file_size"      INTEGER,
  "file_path"      VARCHAR(500) NOT NULL,
  "uploaded_by"    UUID,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──

CREATE UNIQUE INDEX "complaints_org_number_key" ON "complaints" ("organization_id", "complaint_number");
CREATE INDEX "complaints_org_status_idx" ON "complaints" ("organization_id", "status");
CREATE INDEX "complaints_org_type_idx" ON "complaints" ("organization_id", "type");
CREATE INDEX "complaints_org_priority_idx" ON "complaints" ("organization_id", "priority");
CREATE INDEX "complaints_consumer_id_idx" ON "complaints" ("consumer_id");
CREATE INDEX "complaints_assigned_to_idx" ON "complaints" ("assigned_to");
CREATE INDEX "complaints_work_order_id_idx" ON "complaints" ("work_order_id");
CREATE INDEX "complaints_created_at_idx" ON "complaints" ("created_at");
CREATE INDEX "complaints_sla_due_at_idx" ON "complaints" ("sla_due_at");
CREATE INDEX "complaint_notes_complaint_id_idx" ON "complaint_notes" ("complaint_id");
CREATE INDEX "complaint_attachments_complaint_id_idx" ON "complaint_attachments" ("complaint_id");

-- ── Foreign keys ──

ALTER TABLE "complaints"
  ADD CONSTRAINT "complaints_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "complaints_consumer_id_fkey"
    FOREIGN KEY ("consumer_id") REFERENCES "consumers" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "complaints_assigned_to_fkey"
    FOREIGN KEY ("assigned_to") REFERENCES "employees" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "complaints_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "complaints_closed_by_fkey"
    FOREIGN KEY ("closed_by") REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "complaints_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_orders" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "complaints_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "complaints_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "complaint_notes"
  ADD CONSTRAINT "complaint_notes_complaint_id_fkey"
    FOREIGN KEY ("complaint_id") REFERENCES "complaints" ("id") ON DELETE CASCADE,
  ADD CONSTRAINT "complaint_notes_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "complaint_attachments"
  ADD CONSTRAINT "complaint_attachments_complaint_id_fkey"
    FOREIGN KEY ("complaint_id") REFERENCES "complaints" ("id") ON DELETE CASCADE,
  ADD CONSTRAINT "complaint_attachments_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE SET NULL;

-- ── Permissions ──

INSERT INTO "permissions" ("id", "code", "name", "module", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'complaint.read',    'View Complaints',       'complaint', NOW(), NOW()),
  (gen_random_uuid(), 'complaint.create',  'Create Complaints',     'complaint', NOW(), NOW()),
  (gen_random_uuid(), 'complaint.assign',  'Assign Complaints',     'complaint', NOW(), NOW()),
  (gen_random_uuid(), 'complaint.resolve', 'Resolve Complaints',    'complaint', NOW(), NOW()),
  (gen_random_uuid(), 'complaint.close',   'Close Complaints',      'complaint', NOW(), NOW()),
  (gen_random_uuid(), 'complaint.reports', 'View Complaint Reports','complaint', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ── Document sequence ──

INSERT INTO "document_sequences" ("id", "organization_id", "document_type", "prefix", "next_number", "padding", "created_at", "updated_at")
SELECT gen_random_uuid(), o.id, 'complaint', 'CS-', 1, 6, NOW(), NOW()
FROM "organizations" o
ON CONFLICT DO NOTHING;
