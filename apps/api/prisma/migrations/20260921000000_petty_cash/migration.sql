-- Petty Cash Fund (imprest system).
--   • A fund is registered with an imprest amount + its Petty Cash and Cash-in-Bank
--     GL accounts. NO journal entry on setup (the fund is already on the books).
--   • Individual disbursements are recorded as petty-cash vouchers (no JE).
--   • On REPLENISHMENT the accountant posts one JEV (Dr the vouchers' expense
--     accounts, Cr Cash in Bank) — the only time a JE is recorded.
-- Cashier (custodian) records vouchers + prepares replenishment; accountant posts.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "petty_cash_fund_status" AS ENUM ('active', 'closed');
CREATE TYPE "petty_cash_voucher_status" AS ENUM ('unreplenished', 'replenished', 'cancelled');
CREATE TYPE "petty_cash_replenishment_status" AS ENUM ('draft', 'posted', 'cancelled');

-- The replenishment JEV carries its own source type (visible in the JEV register).
ALTER TYPE "jev_source_type" ADD VALUE IF NOT EXISTS 'petty_cash';

-- ── petty_cash_funds ─────────────────────────────────────────────────────────
CREATE TABLE "petty_cash_funds" (
  "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"          UUID NOT NULL,
  "name"                     VARCHAR(120) NOT NULL,
  "imprest_amount"           DECIMAL(18,2) NOT NULL,
  "petty_cash_account_id"    UUID NOT NULL,
  "cash_in_bank_account_id"  UUID NOT NULL,
  "custodian_user_id"        UUID,
  "status"                   "petty_cash_fund_status" NOT NULL DEFAULT 'active',
  "created_by"               UUID,
  "updated_by"               UUID,
  "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"                  INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "petty_cash_funds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "petty_cash_funds_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_funds_petty_cash_account_id_fkey"
    FOREIGN KEY ("petty_cash_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_funds_cash_in_bank_account_id_fkey"
    FOREIGN KEY ("cash_in_bank_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_funds_custodian_user_id_fkey"
    FOREIGN KEY ("custodian_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_funds_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_funds_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "petty_cash_funds_organization_id_idx" ON "petty_cash_funds"("organization_id");

-- ── petty_cash_replenishments (created before vouchers: vouchers reference it) ─
CREATE TABLE "petty_cash_replenishments" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "fund_id"         UUID NOT NULL,
  "repl_number"     VARCHAR(30) NOT NULL,
  "repl_date"       DATE NOT NULL,
  "status"          "petty_cash_replenishment_status" NOT NULL DEFAULT 'draft',
  "total_amount"    DECIMAL(18,2) NOT NULL DEFAULT 0,
  "jev_id"          UUID,
  "prepared_by"     UUID,
  "prepared_at"     TIMESTAMPTZ(6),
  "posted_by"       UUID,
  "posted_at"       TIMESTAMPTZ(6),
  "cancelled_by"    UUID,
  "cancelled_at"    TIMESTAMPTZ(6),
  "created_by"      UUID,
  "updated_by"      UUID,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"         INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "petty_cash_replenishments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "petty_cash_replenishments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_fund_id_fkey"
    FOREIGN KEY ("fund_id") REFERENCES "petty_cash_funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_jev_id_fkey"
    FOREIGN KEY ("jev_id") REFERENCES "journal_entry_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_prepared_by_fkey"
    FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_posted_by_fkey"
    FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_cancelled_by_fkey"
    FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_replenishments_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "petty_cash_replenishments_organization_id_repl_number_key"
  ON "petty_cash_replenishments"("organization_id", "repl_number");
CREATE INDEX "petty_cash_replenishments_organization_id_fund_id_status_idx"
  ON "petty_cash_replenishments"("organization_id", "fund_id", "status");

-- ── petty_cash_vouchers ──────────────────────────────────────────────────────
CREATE TABLE "petty_cash_vouchers" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL,
  "fund_id"           UUID NOT NULL,
  "pcv_number"        VARCHAR(30) NOT NULL,
  "pcv_date"          DATE NOT NULL,
  "payee_name"        VARCHAR(160) NOT NULL,
  "particulars"       TEXT NOT NULL,
  "amount"            DECIMAL(18,2) NOT NULL,
  "charge_account_id" UUID NOT NULL,
  "status"            "petty_cash_voucher_status" NOT NULL DEFAULT 'unreplenished',
  "replenishment_id"  UUID,
  "created_by"        UUID,
  "updated_by"        UUID,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "version"           INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "petty_cash_vouchers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "petty_cash_vouchers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_vouchers_fund_id_fkey"
    FOREIGN KEY ("fund_id") REFERENCES "petty_cash_funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_vouchers_charge_account_id_fkey"
    FOREIGN KEY ("charge_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_vouchers_replenishment_id_fkey"
    FOREIGN KEY ("replenishment_id") REFERENCES "petty_cash_replenishments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_vouchers_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "petty_cash_vouchers_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "petty_cash_vouchers_organization_id_pcv_number_key"
  ON "petty_cash_vouchers"("organization_id", "pcv_number");
CREATE INDEX "petty_cash_vouchers_organization_id_fund_id_status_idx"
  ON "petty_cash_vouchers"("organization_id", "fund_id", "status");
CREATE INDEX "petty_cash_vouchers_replenishment_id_idx"
  ON "petty_cash_vouchers"("replenishment_id");

-- ── Permissions (global) ─────────────────────────────────────────────────────
INSERT INTO "permissions" ("id", "code", "name", "module") VALUES
  (gen_random_uuid(), 'accounting.petty_cash.read',    'View Petty Cash Fund', 'accounting'),
  (gen_random_uuid(), 'accounting.petty_cash.operate', 'Operate Petty Cash Fund (record vouchers, prepare replenishment)', 'accounting'),
  (gen_random_uuid(), 'accounting.petty_cash.manage',  'Manage Petty Cash Fund (set up fund, post replenishment)', 'accounting')
ON CONFLICT ("code") DO NOTHING;

-- ── Role grants (per organization) ───────────────────────────────────────────
-- Cashier (custodian): read + operate.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), r."id", p."id"
  FROM "roles" r JOIN "permissions" p
    ON p."code" IN ('accounting.petty_cash.read', 'accounting.petty_cash.operate')
 WHERE r."code" = 'CASHIER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Accountant: read + manage (set up fund + post replenishment JEV).
INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), r."id", p."id"
  FROM "roles" r JOIN "permissions" p
    ON p."code" IN ('accounting.petty_cash.read', 'accounting.petty_cash.manage')
 WHERE r."code" = 'ACCOUNTANT'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Admin: read + operate (NOT manage — posting stays with the accountant).
INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), r."id", p."id"
  FROM "roles" r JOIN "permissions" p
    ON p."code" IN ('accounting.petty_cash.read', 'accounting.petty_cash.operate')
 WHERE r."code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
