-- Migration: init_core_platform
-- Generated to exactly match apps/api/prisma/schema.prisma.
--
-- NOTE ON HOW THIS FILE WAS APPLIED: in the sandbox used to build this,
-- `binaries.prisma.sh` (Prisma's query-engine CDN) was not reachable, so
-- `prisma migrate dev` could not run. This SQL was applied directly via
-- `psql` instead, against a real PostgreSQL 16 instance, and verified
-- with real automated tests (see prisma/tests/). On a machine with normal
-- internet access, run `npx prisma migrate dev` against a fresh database
-- and Prisma will apply this exact file itself and set up its own
-- `_prisma_migrations` tracking correctly — nothing needs to be redone
-- by hand there.

-- ════════════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ════════════════════════════════════════════════════════════════════
-- gen_random_uuid() is built into PostgreSQL 13+ core. pgcrypto is
-- created anyway for compatibility with environments running an older
-- minor version or relying on pgcrypto's other functions later.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ════════════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE organizational_unit_type AS ENUM (
  'organization_wide', 'division', 'department', 'section', 'office', 'unit'
);

CREATE TYPE fiscal_year_status AS ENUM ('open', 'closed');

CREATE TYPE accounting_period_status AS ENUM ('open', 'closed');

CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete', 'status_change');

CREATE TYPE workflow_instance_status AS ENUM ('in_progress', 'approved', 'rejected', 'cancelled');

CREATE TYPE workflow_action_decision AS ENUM ('approved', 'rejected', 'returned', 'cancelled');

-- ════════════════════════════════════════════════════════════════════
-- 1. organizations
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       varchar(20)  NOT NULL,
  name       varchar(255) NOT NULL,
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT organizations_code_key UNIQUE (code)
);

-- ════════════════════════════════════════════════════════════════════
-- 2. users
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  username        varchar(50)  NOT NULL,
  email           varchar(255) NOT NULL,
  password_hash   varchar(255) NOT NULL,
  is_active       boolean      NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  version         integer      NOT NULL DEFAULT 1,
  CONSTRAINT users_organization_id_username_key UNIQUE (organization_id, username),
  CONSTRAINT users_organization_id_email_key UNIQUE (organization_id, email)
);
CREATE INDEX idx_users_organization_id ON users (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. organization_settings
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE organization_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid         NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE RESTRICT,
  legal_name               varchar(255) NOT NULL,
  default_currency_code    varchar(3)   NOT NULL DEFAULT 'PHP',
  fiscal_year_start_month  smallint     NOT NULL DEFAULT 1,
  timezone                 varchar(50)  NOT NULL DEFAULT 'Asia/Manila',
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES users (id) ON DELETE SET NULL
);

-- ════════════════════════════════════════════════════════════════════
-- 4. organizational_units (self-referencing tree)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE organizational_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid                     NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  parent_unit_id  uuid REFERENCES organizational_units (id) ON DELETE RESTRICT,
  unit_type       organizational_unit_type NOT NULL,
  code            varchar(20)              NOT NULL,
  name            varchar(255)             NOT NULL,
  is_active       boolean                  NOT NULL DEFAULT true,
  created_at      timestamptz              NOT NULL DEFAULT now(),
  updated_at      timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT organizational_units_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_organizational_units_organization_id ON organizational_units (organization_id);
CREATE INDEX idx_organizational_units_parent_unit_id ON organizational_units (parent_unit_id);

-- ════════════════════════════════════════════════════════════════════
-- 5. departments
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE departments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  organizational_unit_id uuid         NOT NULL UNIQUE REFERENCES organizational_units (id) ON DELETE RESTRICT,
  code                   varchar(20)  NOT NULL,
  name                   varchar(255) NOT NULL,
  is_active              boolean      NOT NULL DEFAULT true,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT departments_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_departments_organization_id ON departments (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 6. responsibility_centers
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE responsibility_centers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  organizational_unit_id uuid         NOT NULL REFERENCES organizational_units (id) ON DELETE RESTRICT,
  code                   varchar(20)  NOT NULL,
  name                   varchar(255) NOT NULL,
  is_active              boolean      NOT NULL DEFAULT true,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT responsibility_centers_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_responsibility_centers_organization_id ON responsibility_centers (organization_id);
CREATE INDEX idx_responsibility_centers_organizational_unit_id ON responsibility_centers (organizational_unit_id);

-- ════════════════════════════════════════════════════════════════════
-- 7. locations
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  code            varchar(20)  NOT NULL,
  name            varchar(255) NOT NULL,
  address_line1   varchar(255),
  address_line2   varchar(255),
  city            varchar(100),
  region          varchar(100),
  postal_code     varchar(20),
  is_active       boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT locations_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_locations_organization_id ON locations (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 8. roles
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  code            varchar(50)  NOT NULL,
  name            varchar(100) NOT NULL,
  description     text,
  is_system_role  boolean      NOT NULL DEFAULT false,
  is_active       boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT roles_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_roles_organization_id ON roles (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 9. permissions (global catalog, not tenant-scoped)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(100) NOT NULL UNIQUE,
  name        varchar(150) NOT NULL,
  description text,
  module      varchar(50)  NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_permissions_module ON permissions (module);

-- ════════════════════════════════════════════════════════════════════
-- 10. user_roles
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE user_roles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id                uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  organizational_unit_id uuid NOT NULL REFERENCES organizational_units (id) ON DELETE RESTRICT,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT user_roles_user_id_role_id_organizational_unit_id_key
    UNIQUE (user_id, role_id, organizational_unit_id)
);
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);

-- ════════════════════════════════════════════════════════════════════
-- 11. role_permissions
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE role_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_role_id ON role_permissions (role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions (permission_id);

-- ════════════════════════════════════════════════════════════════════
-- 12. fiscal_years
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE fiscal_years (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  year            integer     NOT NULL,
  name            varchar(50) NOT NULL,
  start_date      date        NOT NULL,
  end_date        date        NOT NULL,
  status          fiscal_year_status NOT NULL DEFAULT 'open',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer     NOT NULL DEFAULT 1,
  CONSTRAINT fiscal_years_organization_id_year_key UNIQUE (organization_id, year)
);
CREATE INDEX idx_fiscal_years_organization_id ON fiscal_years (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 13. accounting_periods
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE accounting_periods (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid        NOT NULL REFERENCES fiscal_years (id) ON DELETE RESTRICT,
  period_number  smallint    NOT NULL,
  name           varchar(50) NOT NULL,
  start_date     date        NOT NULL,
  end_date       date        NOT NULL,
  status         accounting_period_status NOT NULL DEFAULT 'open',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer     NOT NULL DEFAULT 1,
  CONSTRAINT accounting_periods_fiscal_year_id_period_number_key UNIQUE (fiscal_year_id, period_number)
);
CREATE INDEX idx_accounting_periods_fiscal_year_id ON accounting_periods (fiscal_year_id);

-- ════════════════════════════════════════════════════════════════════
-- 14. fund_sources
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE fund_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  code            varchar(20)  NOT NULL,
  name            varchar(255) NOT NULL,
  description     text,
  is_active       boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT fund_sources_organization_id_code_key UNIQUE (organization_id, code)
);
CREATE INDEX idx_fund_sources_organization_id ON fund_sources (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 15. document_sequences
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE document_sequences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  document_type     varchar(50) NOT NULL,
  fiscal_year_id    uuid REFERENCES fiscal_years (id) ON DELETE RESTRICT,
  prefix            varchar(20) NOT NULL,
  next_number       bigint      NOT NULL DEFAULT 1,
  padding           smallint    NOT NULL DEFAULT 6,
  last_generated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer     NOT NULL DEFAULT 1,
  CONSTRAINT document_sequences_org_doctype_fy_key
    UNIQUE (organization_id, document_type, fiscal_year_id)
);
CREATE INDEX idx_document_sequences_organization_id ON document_sequences (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 16. attachments (polymorphic)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  attachable_table  varchar(100) NOT NULL,
  attachable_id     uuid         NOT NULL,
  file_name         varchar(255) NOT NULL,
  file_path         varchar(500) NOT NULL,
  mime_type         varchar(150) NOT NULL,
  file_size_bytes   bigint       NOT NULL,
  uploaded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_attachable ON attachments (attachable_table, attachable_id);
CREATE INDEX idx_attachments_organization_id ON attachments (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 17. comments (polymorphic, soft-deletable)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  commentable_table varchar(100) NOT NULL,
  commentable_id    uuid         NOT NULL,
  body              text         NOT NULL,
  is_deleted        boolean      NOT NULL DEFAULT false,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_commentable ON comments (commentable_table, commentable_id);
CREATE INDEX idx_comments_organization_id ON comments (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 18. audit_logs (append-only)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations (id) ON DELETE SET NULL,
  table_name      varchar(100) NOT NULL,
  record_id       uuid         NOT NULL,
  action          audit_action NOT NULL,
  changed_fields  jsonb,
  performed_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  performed_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_table_record ON audit_logs (table_name, record_id);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs (performed_at);
CREATE INDEX idx_audit_logs_organization_id ON audit_logs (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 19. workflow_definitions
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE workflow_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid         NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  name              varchar(150) NOT NULL,
  applies_to_table  varchar(100) NOT NULL,
  is_active         boolean      NOT NULL DEFAULT true,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  version           integer      NOT NULL DEFAULT 1
);
CREATE INDEX idx_workflow_definitions_organization_id ON workflow_definitions (organization_id);
CREATE INDEX idx_workflow_definitions_applies_to_table ON workflow_definitions (applies_to_table);

-- ════════════════════════════════════════════════════════════════════
-- 20. workflow_steps
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE workflow_steps (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions (id) ON DELETE CASCADE,
  step_order             smallint     NOT NULL,
  name                   varchar(150) NOT NULL,
  approver_role_id       uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  is_final_step          boolean      NOT NULL DEFAULT false,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT workflow_steps_workflow_definition_id_step_order_key
    UNIQUE (workflow_definition_id, step_order)
);
CREATE INDEX idx_workflow_steps_workflow_definition_id ON workflow_steps (workflow_definition_id);

-- ════════════════════════════════════════════════════════════════════
-- 21. workflow_instances (polymorphic)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE workflow_instances (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions (id) ON DELETE RESTRICT,
  subject_table          varchar(100) NOT NULL,
  subject_id             uuid         NOT NULL,
  status                 workflow_instance_status NOT NULL DEFAULT 'in_progress',
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  version                integer      NOT NULL DEFAULT 1
);
CREATE INDEX idx_workflow_instances_subject ON workflow_instances (subject_table, subject_id);
CREATE INDEX idx_workflow_instances_organization_id ON workflow_instances (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 22. workflow_actions (append-only)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE workflow_actions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instances (id) ON DELETE CASCADE,
  workflow_step_id     uuid NOT NULL REFERENCES workflow_steps (id) ON DELETE RESTRICT,
  actor_user_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decision             workflow_action_decision NOT NULL,
  remarks              text,
  acted_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_actions_workflow_instance_id ON workflow_actions (workflow_instance_id);

-- ════════════════════════════════════════════════════════════════════
-- 23. notifications
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title           varchar(255) NOT NULL,
  body            text,
  is_read         boolean NOT NULL DEFAULT false,
  read_at         timestamptz,
  link_url        varchar(500),
  related_table   varchar(100),
  related_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read);
CREATE INDEX idx_notifications_organization_id ON notifications (organization_id);

-- ════════════════════════════════════════════════════════════════════
-- 24. system_settings (global, not tenant-scoped)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE system_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         varchar(100) NOT NULL UNIQUE,
  value       text,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL
);

-- ════════════════════════════════════════════════════════════════════
-- AUDIT LOG TRIGGER INFRASTRUCTURE
-- ════════════════════════════════════════════════════════════════════

-- Generic trigger function: fires on every INSERT/UPDATE/DELETE of any
-- table it's attached to and writes one row into audit_logs. This is
-- how audit_logs stays "append-only from the application perspective" —
-- application code never writes to audit_logs directly; only this
-- trigger does, and it only ever inserts.
CREATE OR REPLACE FUNCTION fn_audit_log() RETURNS trigger AS $$
DECLARE
  v_organization_id uuid;
  v_record_id uuid;
  v_action audit_action;
  v_changed jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_record_id := (to_jsonb(NEW)->>'id')::uuid;
    v_changed := jsonb_build_object('after', to_jsonb(NEW));
    v_organization_id := NULLIF(to_jsonb(NEW)->>'organization_id', '')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_record_id := (to_jsonb(NEW)->>'id')::uuid;
    v_changed := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_organization_id := NULLIF(to_jsonb(NEW)->>'organization_id', '')::uuid;
  ELSE -- DELETE
    v_action := 'delete';
    v_record_id := (to_jsonb(OLD)->>'id')::uuid;
    v_changed := jsonb_build_object('before', to_jsonb(OLD));
    v_organization_id := NULLIF(to_jsonb(OLD)->>'organization_id', '')::uuid;
  END IF;

  INSERT INTO audit_logs (organization_id, table_name, record_id, action, changed_fields, performed_by)
  VALUES (
    v_organization_id,
    TG_TABLE_NAME,
    v_record_id,
    v_action,
    v_changed,
    NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attach the audit trigger to every Core Platform table EXCEPT
-- audit_logs itself (which gets anti-tamper protection instead, below).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'organization_settings', 'organizational_units',
    'departments', 'responsibility_centers', 'locations',
    'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
    'fiscal_years', 'accounting_periods', 'fund_sources',
    'document_sequences', 'attachments', 'comments',
    'workflow_definitions', 'workflow_steps', 'workflow_instances',
    'workflow_actions', 'notifications', 'system_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION fn_audit_log();', t
    );
  END LOOP;
END $$;

-- Anti-tamper protection on audit_logs itself: enforces "append-only
-- from the application perspective" at the database level, not just by
-- convention — no application code path should ever need this to fire,
-- but if one tried, it is rejected outright.
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_log_mutation();
