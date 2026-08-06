-- Asset Management Module
-- Adds asset categories (COA mapping), depreciation runs, and asset transfers

-- ── Enums ──

CREATE TYPE depreciation_run_status AS ENUM ('draft', 'posted', 'voided');
CREATE TYPE asset_transfer_status AS ENUM ('pending', 'approved', 'completed', 'rejected');
CREATE TYPE depreciation_method AS ENUM ('straight_line');

-- Add depreciation and disposal to jev_source_type
ALTER TYPE jev_source_type ADD VALUE IF NOT EXISTS 'depreciation';
ALTER TYPE jev_source_type ADD VALUE IF NOT EXISTS 'disposal';

-- ── Asset Categories ──

CREATE TABLE asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  depreciation_method depreciation_method NOT NULL DEFAULT 'straight_line',
  default_useful_life INT,
  ppe_account_code VARCHAR(20),
  accum_depr_account_code VARCHAR(20),
  depr_expense_account_code VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, code)
);
CREATE INDEX idx_asset_categories_org ON asset_categories(organization_id);

-- Add asset_category_id to property_records
ALTER TABLE property_records ADD COLUMN asset_category_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_property_records_category ON property_records(asset_category_id);

-- ── Depreciation Runs ──

CREATE TABLE depreciation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  run_number VARCHAR(30) NOT NULL,
  period_month INT NOT NULL,
  period_year INT NOT NULL,
  status depreciation_run_status NOT NULL DEFAULT 'draft',
  total_depreciation DECIMAL(18,2) NOT NULL DEFAULT 0,
  asset_count INT NOT NULL DEFAULT 0,
  jev_id UUID REFERENCES journal_entry_vouchers(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1,
  UNIQUE(organization_id, period_month, period_year)
);
CREATE INDEX idx_depreciation_runs_org ON depreciation_runs(organization_id);
CREATE INDEX idx_depreciation_runs_status ON depreciation_runs(organization_id, status);

CREATE TABLE depreciation_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depreciation_run_id UUID NOT NULL REFERENCES depreciation_runs(id) ON DELETE CASCADE,
  property_record_id UUID NOT NULL REFERENCES property_records(id) ON DELETE RESTRICT,
  asset_category_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  depreciation_amount DECIMAL(18,2) NOT NULL,
  accum_before DECIMAL(18,2) NOT NULL,
  accum_after DECIMAL(18,2) NOT NULL,
  book_value_before DECIMAL(18,2) NOT NULL,
  book_value_after DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_depr_run_items_run ON depreciation_run_items(depreciation_run_id);
CREATE INDEX idx_depr_run_items_property ON depreciation_run_items(property_record_id);

-- ── Asset Transfers ──

CREATE TABLE asset_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  transfer_number VARCHAR(30) NOT NULL,
  property_record_id UUID NOT NULL REFERENCES property_records(id) ON DELETE RESTRICT,
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  status asset_transfer_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1,
  UNIQUE(organization_id, transfer_number)
);
CREATE INDEX idx_asset_transfers_org ON asset_transfers(organization_id);
CREATE INDEX idx_asset_transfers_property ON asset_transfers(property_record_id);
CREATE INDEX idx_asset_transfers_status ON asset_transfers(organization_id, status);

-- ── Permissions ──

INSERT INTO permissions (code, name, description, module) VALUES
  ('asset.read', 'View Assets', 'View asset register, categories, and depreciation data', 'asset'),
  ('asset.category.manage', 'Manage Asset Categories', 'Create and edit asset categories', 'asset'),
  ('asset.depreciation.run', 'Run Depreciation', 'Create depreciation runs', 'asset'),
  ('asset.depreciation.post', 'Post Depreciation', 'Post depreciation runs to accounting', 'asset'),
  ('asset.transfer.create', 'Create Asset Transfer', 'Create asset transfer requests', 'asset'),
  ('asset.transfer.approve', 'Approve Asset Transfer', 'Approve asset transfer requests', 'asset'),
  ('asset.reports', 'Asset Reports', 'View asset management reports', 'asset')
ON CONFLICT (code) DO NOTHING;

-- ── Document Sequences ──

INSERT INTO document_sequences (organization_id, document_type, prefix, next_number, padding)
SELECT o.id, 'depreciation_run', 'DR-', 1, 6 FROM organizations o
ON CONFLICT DO NOTHING;

INSERT INTO document_sequences (organization_id, document_type, prefix, next_number, padding)
SELECT o.id, 'asset_transfer', 'AT-', 1, 6 FROM organizations o
ON CONFLICT DO NOTHING;
