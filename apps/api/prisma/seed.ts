// prisma/seed.ts — Core Platform baseline data.
//
// Safe to run more than once: every step uses `upsert`, so re-running
// this script updates existing rows in place instead of creating
// duplicates or erroring on unique-constraint violations.
//
// Run via: npm run prisma:seed --workspace=@mswd-erp/api
// (wraps `prisma db seed`, which this project's package.json wires to
// this file — see the "prisma.seed" key in apps/api/package.json).

// Explicit env loading — do not rely on PrismaClient's own implicit
// .env detection for standalone scripts run outside `prisma migrate`/
// `prisma generate` (which load .env themselves via the Prisma CLI
// wrapper, not via PrismaClient). Resolves relative to THIS file's
// location, so it finds apps/api/.env correctly regardless of the
// working directory the script happens to be run from.
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Seed-only placeholder credential. This is NOT the credential the real
// cashier/admin will use in production — it exists purely so the freshly
// migrated database has at least one working login to sign in with and
// immediately change. Never logged, never stored anywhere but here as a
// literal, and only ever persisted as a bcrypt hash — see
// `password_hash` below, never a plain-text column.
const SEED_ADMIN_PASSWORD = 'ChangeMe!2026';

async function main() {
  // ── 1. Organization ──
  // No organization-specific values are hard-coded into the schema
  // itself (see prisma/schema.prisma's header comment) — this is the
  // one and only place the real organization's identity is named.
  const organization = await prisma.organization.upsert({
    where: { code: 'MSWD' },
    update: {},
    create: {
      code: 'MSWD',
      name: 'Metro Siquijor Water District',
      isActive: true,
    },
  });

  // ── 2. Organization settings (default PHP currency) ──
  await prisma.organizationSettings.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: {
      organizationId: organization.id,
      legalName: 'Metro Siquijor Water District',
      defaultCurrencyCode: 'PHP',
      fiscalYearStartMonth: 1,
      timezone: 'Asia/Manila',
    },
  });

  // ── 3. Root organizational unit ──
  // Every organization needs exactly one "organization_wide" unit so
  // unscoped role assignments (user_roles.organizational_unit_id, which
  // is NOT NULL by design) always have a concrete row to point at.
  const rootUnit = await prisma.organizationalUnit.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'ROOT' } },
    update: {},
    create: {
      organizationId: organization.id,
      code: 'ROOT',
      name: `${organization.name} (Organization-Wide)`,
      unitType: 'organization_wide',
    },
  });

  // ── 4. Initial system roles ──
  const roleDefinitions = [
    { code: 'ADMIN', name: 'Administrator', description: 'Full system access except business approvals.' },
    { code: 'CASHIER', name: 'Cashier', description: 'Check issuance, release, voiding, and clearing.' },
    { code: 'BUDGET_OFFICER', name: 'Budget Officer', description: 'Appropriation, allotment, obligation management, and budget certification.' },
    { code: 'ACCOUNTANT', name: 'Accountant', description: 'Journal entries, disbursement vouchers, collections.' },
    { code: 'BUDGET_APPROVER', name: 'Budget Approver', description: 'Reviews and approves/rejects budget headers and reservations.' },
    { code: 'PROCUREMENT_OFFICER', name: 'Procurement Officer', description: 'Procurement processing, completeness review, procurement lifecycle.' },
    { code: 'HR_OFFICER', name: 'HR Officer', description: 'Employee, position, and leave administration.' },
    { code: 'EMPLOYEE', name: 'Employee', description: 'End-user / PR preparer. Creates and submits purchase requisitions.' },
    { code: 'DEPARTMENT_HEAD', name: 'Department Head', description: 'Reviews and endorses PRs from their department.' },
    { code: 'GENERAL_MANAGER', name: 'General Manager / HoPE', description: 'Final PR approval authority.' },
    { code: 'BAC_MEMBER', name: 'BAC Member', description: 'Bids and Awards Committee member. Read-only access to procurement projects.' },
    { code: 'INSPECTION_OFFICER', name: 'Inspection & Acceptance', description: 'Records inspection and acceptance of delivered goods/services.' },
    { code: 'SUPPLY_OFFICER', name: 'Supply Officer', description: 'Manages inventory items, stock receipts, RIS approval, stock cards, PAR/ICS, and property records.' },
    { code: 'PROPERTY_CUSTODIAN', name: 'Property Custodian', description: 'Manages property records, PAR/ICS issuance, transfers, and physical counts.' },
    { code: 'INVENTORY_COMMITTEE', name: 'Inventory Committee', description: 'Conducts and approves physical counts, appraises items for disposal.' },
  ];

  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefinitions) {
    roles[def.code] = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: def.code } },
      update: { name: def.name, description: def.description },
      create: {
        organizationId: organization.id,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystemRole: true,
      },
    });
  }

  // ── 5. Initial permissions ──
  // A starter catalog. Business-module permissions (budgeting.*,
  // procurement.*, etc.) are illustrative placeholders matching names
  // already referenced in the approved architecture (docs/04_Database) —
  // they don't imply those modules' tables exist yet.
  const permissionDefinitions = [
    { code: 'core.user.manage', name: 'Manage Users', module: 'core' },
    { code: 'core.role.manage', name: 'Manage Roles & Permissions', module: 'core' },
    { code: 'core.organization.manage_settings', name: 'Manage Organization Settings', module: 'core' },
    { code: 'core.fiscal_period.manage', name: 'Manage Fiscal Years & Periods', module: 'core' },
    { code: 'accounting.check.assign_number', name: 'Assign/Confirm Check Number', module: 'accounting' },
    { code: 'accounting.check.print', name: 'Print Check', module: 'accounting' },
    { code: 'accounting.check.record_release', name: 'Record Check Release', module: 'accounting' },
    { code: 'accounting.check.void', name: 'Void/Spoil Check', module: 'accounting' },
    { code: 'accounting.check.update_clearing', name: 'Update Check Clearing Info', module: 'accounting' },
    { code: 'budgeting.obligation.override_budget_limit', name: 'Override Budget Limit', module: 'budgeting' },
    { code: 'budgeting.cycle.manage', name: 'Manage Budget Cycles', module: 'budgeting' },
    { code: 'budgeting.version.manage', name: 'Manage Budget Versions', module: 'budgeting' },
    { code: 'budgeting.header.manage', name: 'Manage Budget Headers', module: 'budgeting' },
    { code: 'budgeting.header.approve', name: 'Approve or Return Budget Headers', module: 'budgeting' },
    { code: 'budgeting.line.manage', name: 'Manage Budget Lines', module: 'budgeting' },
    { code: 'budgeting.release.create', name: 'Create Budget Releases', module: 'budgeting' },
    { code: 'budgeting.reservation.create', name: 'Create Budget Reservations', module: 'budgeting' },
    { code: 'budgeting.reservation.edit', name: 'Edit Draft Budget Reservations', module: 'budgeting' },
    { code: 'budgeting.reservation.submit', name: 'Submit Budget Reservations', module: 'budgeting' },
    { code: 'budgeting.reservation.approve', name: 'Approve Budget Reservations', module: 'budgeting' },
    { code: 'budgeting.reservation.reject', name: 'Reject Budget Reservations', module: 'budgeting' },
    { code: 'budgeting.reservation.cancel', name: 'Cancel Budget Reservations', module: 'budgeting' },
    { code: 'budgeting.read', name: 'View Budgeting Data', module: 'budgeting' },
    { code: 'procurement.pr.create', name: 'Create Purchase Requests', module: 'procurement' },
    { code: 'procurement.pr.edit', name: 'Edit Draft Purchase Requests', module: 'procurement' },
    { code: 'procurement.pr.submit', name: 'Submit Purchase Requests', module: 'procurement' },
    { code: 'procurement.pr.approve', name: 'Approve Purchase Requests (legacy)', module: 'procurement' },
    { code: 'procurement.pr.reject', name: 'Reject Purchase Requests (legacy)', module: 'procurement' },
    { code: 'procurement.pr.cancel', name: 'Cancel Purchase Requests', module: 'procurement' },
    { code: 'procurement.read', name: 'View Procurement Data', module: 'procurement' },
    { code: 'procurement.pr.endorse', name: 'Endorse Purchase Requests (Dept Head)', module: 'procurement' },
    { code: 'procurement.pr.budget_certify', name: 'Certify Budget Availability', module: 'procurement' },
    { code: 'procurement.pr.final_approve', name: 'Final PR Approval (GM/HoPE)', module: 'procurement' },
    { code: 'procurement.pr.accept_procurement', name: 'Accept PR for Procurement', module: 'procurement' },
    { code: 'procurement.pr.return_to_user', name: 'Return PR to End-User', module: 'procurement' },
    { code: 'procurement.pr.mark_lifecycle', name: 'Advance PR Lifecycle Status', module: 'procurement' },
    { code: 'procurement.pr.view_all', name: 'View All PRs Across Departments', module: 'procurement' },
    { code: 'procurement.ppmp.manage', name: 'Manage PPMP Items', module: 'procurement' },
    { code: 'procurement.app.manage', name: 'Manage APP Items', module: 'procurement' },
    { code: 'procurement.bac.view', name: 'View BAC Procurement Data', module: 'procurement' },
    { code: 'procurement.delegation.manage', name: 'Manage Delegation Authorities', module: 'procurement' },
    { code: 'procurement.pr.inspect', name: 'Record Inspection & Acceptance', module: 'procurement' },
    { code: 'procurement.supplier.manage', name: 'Manage Suppliers', module: 'procurement' },
    { code: 'procurement.po.create', name: 'Create Purchase Orders', module: 'procurement' },
    { code: 'procurement.po.approve', name: 'Approve Purchase Orders', module: 'procurement' },
    { code: 'procurement.caf.create', name: 'Create CAF', module: 'procurement' },
    { code: 'procurement.caf.certify', name: 'Certify CAF (Accounting Official)', module: 'procurement' },
    { code: 'procurement.caf.cancel', name: 'Cancel or Supersede CAF', module: 'procurement' },
    { code: 'procurement.ors.create', name: 'Create ORS', module: 'procurement' },
    { code: 'procurement.ors.requesting_certify', name: 'Certify ORS (Requesting Office)', module: 'procurement' },
    { code: 'procurement.ors.budget_certify', name: 'Certify ORS Budget & Post Obligation', module: 'procurement' },
    { code: 'procurement.ors.adjust', name: 'Adjust or De-obligate ORS', module: 'procurement' },
    { code: 'procurement.ors.cancel', name: 'Cancel ORS', module: 'procurement' },
    // Accounting / General Ledger
    { code: 'accounting.read', name: 'View Accounting Data', module: 'accounting' },
    { code: 'accounting.coa.manage', name: 'Manage Chart of Accounts', module: 'accounting' },
    { code: 'accounting.bank.manage', name: 'Manage Bank Accounts', module: 'accounting' },
    { code: 'accounting.jev.create', name: 'Create Journal Entry Vouchers', module: 'accounting' },
    { code: 'accounting.jev.post', name: 'Post Journal Entry Vouchers', module: 'accounting' },
    { code: 'accounting.jev.void', name: 'Void Journal Entry Vouchers', module: 'accounting' },
    { code: 'accounting.period.manage', name: 'Manage Accounting Periods', module: 'accounting' },
    { code: 'accounting.reports', name: 'View Financial Statements & Reports', module: 'accounting' },
    { code: 'accounting.reconcile', name: 'Perform Bank Reconciliation', module: 'accounting' },
    // Inventory & Property Management
    { code: 'inventory.read', name: 'View Inventory Data', module: 'inventory' },
    { code: 'inventory.item.manage', name: 'Manage Inventory Items', module: 'inventory' },
    { code: 'inventory.receive', name: 'Receive Stock', module: 'inventory' },
    { code: 'inventory.issue', name: 'Issue Stock via RIS', module: 'inventory' },
    { code: 'inventory.ris.approve', name: 'Approve RIS', module: 'inventory' },
    { code: 'inventory.stock_card', name: 'View/Manage Stock Cards', module: 'inventory' },
    { code: 'inventory.par', name: 'Issue/Manage PAR', module: 'inventory' },
    { code: 'inventory.ics', name: 'Issue/Manage ICS', module: 'inventory' },
    { code: 'inventory.property_card', name: 'View/Manage Property Records', module: 'inventory' },
    { code: 'inventory.transfer', name: 'Transfer Property', module: 'inventory' },
    { code: 'inventory.request', name: 'Request Supplies (RIS)', module: 'inventory' },
    { code: 'inventory.acknowledge', name: 'Acknowledge Property Receipt', module: 'inventory' },
    { code: 'inventory.physical_count', name: 'Conduct Physical Count', module: 'inventory' },
    { code: 'inventory.physical_count.approve', name: 'Approve Physical Count', module: 'inventory' },
    { code: 'inventory.dispose.request', name: 'Request Disposal', module: 'inventory' },
    { code: 'inventory.dispose.appraise', name: 'Appraise Items for Disposal', module: 'inventory' },
    { code: 'inventory.dispose.approve', name: 'Approve Disposal', module: 'inventory' },
    { code: 'inventory.ledger', name: 'View Inventory Ledger/Reports', module: 'inventory' },
    { code: 'inventory.reconcile', name: 'Reconcile Inventory', module: 'inventory' },
  ];

  const permissions: Record<string, { id: string }> = {};
  for (const def of permissionDefinitions) {
    permissions[def.code] = await prisma.permission.upsert({
      where: { code: def.code },
      update: { name: def.name, module: def.module },
      create: def,
    });
  }

  // ── Role → permission grants ──
  const grant = async (roleCode: string, permissionCode: string) => {
    const role = roles[roleCode];
    const permission = permissions[permissionCode];
    if (!role) throw new Error(`Seed error: role "${roleCode}" was not created above.`);
    if (!permission) throw new Error(`Seed error: permission "${permissionCode}" was not created above.`);
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  };

  // Admin gets everything EXCEPT business approval permissions.
  // Per spec: "System Administrator may manage users and permissions but
  // must not automatically receive authority to prepare, certify, approve,
  // award, or issue procurement transactions."
  const adminExcludedPermissions = new Set([
    'procurement.pr.endorse',
    'procurement.pr.budget_certify',
    'procurement.pr.final_approve',
    'procurement.pr.inspect',
    'procurement.po.approve',
    'procurement.caf.certify',
    'procurement.ors.requesting_certify',
    'procurement.ors.budget_certify',
    'inventory.ris.approve',
    'inventory.physical_count.approve',
    'inventory.dispose.approve',
    'inventory.dispose.appraise',
    'accounting.jev.post',
    'accounting.jev.void',
    'accounting.period.manage',
    'accounting.reconcile',
  ]);
  for (const code of Object.keys(permissions)) {
    if (!adminExcludedPermissions.has(code)) {
      await grant('ADMIN', code);
    }
  }
  // Cashier: check-lifecycle permissions + accounting read.
  for (const code of [
    'accounting.check.assign_number',
    'accounting.check.print',
    'accounting.check.record_release',
    'accounting.check.void',
    'accounting.check.update_clearing',
    'accounting.read',
    'accounting.reports',
  ]) {
    await grant('CASHIER', code);
  }

  // Budget Officer: all budgeting + budget certification for PRs.
  for (const code of [
    'budgeting.obligation.override_budget_limit',
    'budgeting.cycle.manage',
    'budgeting.version.manage',
    'budgeting.header.manage',
    'budgeting.line.manage',
    'budgeting.release.create',
    'budgeting.reservation.create',
    'budgeting.reservation.edit',
    'budgeting.reservation.submit',
    'budgeting.reservation.approve',
    'budgeting.reservation.reject',
    'budgeting.reservation.cancel',
    'budgeting.read',
    'procurement.pr.budget_certify',
    'procurement.pr.reject',
    'procurement.pr.return_to_user',
    'procurement.pr.view_all',
    'procurement.ppmp.manage',
    'procurement.app.manage',
    'procurement.ors.budget_certify',
    'procurement.read',
  ]) {
    await grant('BUDGET_OFFICER', code);
  }

  // Budget Approver: budget header/reservation approval + read.
  for (const code of [
    'budgeting.read',
    'budgeting.header.approve',
    'budgeting.reservation.approve',
    'budgeting.reservation.reject',
  ]) {
    await grant('BUDGET_APPROVER', code);
  }

  // Procurement Officer: procurement processing (not PR creation/submission).
  for (const code of [
    'procurement.pr.accept_procurement',
    'procurement.pr.return_to_user',
    'procurement.pr.mark_lifecycle',
    'procurement.pr.view_all',
    'procurement.pr.cancel',
    'procurement.ppmp.manage',
    'procurement.app.manage',
    'procurement.supplier.manage',
    'procurement.po.create',
    'procurement.caf.create',
    'procurement.caf.cancel',
    'procurement.ors.create',
    'procurement.read',
    'budgeting.read',
  ]) {
    await grant('PROCUREMENT_OFFICER', code);
  }

  // Employee (End-User / Preparer): create, edit, submit, cancel own PRs.
  for (const code of [
    'procurement.pr.create',
    'procurement.pr.edit',
    'procurement.pr.submit',
    'procurement.pr.cancel',
    'procurement.read',
  ]) {
    await grant('EMPLOYEE', code);
  }

  // Department Head: endorse PRs, reject, return, ORS requesting certification + read.
  for (const code of [
    'procurement.pr.endorse',
    'procurement.pr.reject',
    'procurement.pr.return_to_user',
    'procurement.ors.requesting_certify',
    'procurement.read',
  ]) {
    await grant('DEPARTMENT_HEAD', code);
  }

  // General Manager / HoPE: final PR approval, PO approval, reject + accounting read.
  for (const code of [
    'procurement.pr.final_approve',
    'procurement.pr.reject',
    'procurement.pr.view_all',
    'procurement.po.approve',
    'procurement.read',
    'budgeting.read',
    'accounting.read',
    'accounting.reports',
    'accounting.period.manage',
  ]) {
    await grant('GENERAL_MANAGER', code);
  }

  // BAC Member: read-only procurement data.
  for (const code of [
    'procurement.bac.view',
    'procurement.read',
  ]) {
    await grant('BAC_MEMBER', code);
  }

  // Accountant: CAF certification, ORS creation, ORS requesting certification + full accounting.
  for (const code of [
    'procurement.caf.certify',
    'procurement.caf.cancel',
    'procurement.ors.create',
    'procurement.ors.requesting_certify',
    'procurement.ors.adjust',
    'procurement.read',
    'budgeting.read',
    'accounting.read',
    'accounting.coa.manage',
    'accounting.bank.manage',
    'accounting.jev.create',
    'accounting.jev.post',
    'accounting.jev.void',
    'accounting.period.manage',
    'accounting.reports',
    'accounting.reconcile',
  ]) {
    await grant('ACCOUNTANT', code);
  }

  // Inspection Officer: inspection & acceptance.
  for (const code of [
    'procurement.pr.inspect',
    'procurement.read',
  ]) {
    await grant('INSPECTION_OFFICER', code);
  }

  // Supply Officer: full operational inventory permissions.
  for (const code of [
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
    'inventory.dispose.request',
  ]) {
    await grant('SUPPLY_OFFICER', code);
  }

  // Property Custodian: property-focused permissions.
  for (const code of [
    'inventory.read',
    'inventory.property_card',
    'inventory.par',
    'inventory.ics',
    'inventory.transfer',
    'inventory.physical_count',
    'inventory.ledger',
  ]) {
    await grant('PROPERTY_CUSTODIAN', code);
  }

  // Inventory Committee: count and disposal permissions.
  for (const code of [
    'inventory.read',
    'inventory.physical_count',
    'inventory.physical_count.approve',
    'inventory.dispose.appraise',
    'inventory.ledger',
  ]) {
    await grant('INVENTORY_COMMITTEE', code);
  }

  // General Manager: inventory approval permissions.
  for (const code of [
    'inventory.read',
    'inventory.physical_count.approve',
    'inventory.dispose.approve',
    'inventory.reconcile',
    'inventory.ledger',
  ]) {
    await grant('GENERAL_MANAGER', code);
  }

  // Department Head: request and acknowledge.
  for (const code of [
    'inventory.read',
    'inventory.request',
    'inventory.acknowledge',
    'inventory.ledger',
  ]) {
    await grant('DEPARTMENT_HEAD', code);
  }

  // Employee (End-User): request supplies and acknowledge property.
  for (const code of [
    'inventory.read',
    'inventory.request',
    'inventory.acknowledge',
  ]) {
    await grant('EMPLOYEE', code);
  }

  // ── 6. Fiscal year setup ──
  const currentYear = new Date().getFullYear();
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { organizationId_year: { organizationId: organization.id, year: currentYear } },
    update: {},
    create: {
      organizationId: organization.id,
      year: currentYear,
      name: `FY${currentYear}`,
      startDate: new Date(`${currentYear}-01-01T00:00:00.000Z`),
      endDate: new Date(`${currentYear}-12-31T00:00:00.000Z`),
      status: 'open',
    },
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  for (let month = 1; month <= 12; month++) {
    const startDate = new Date(Date.UTC(currentYear, month - 1, 1));
    const endDate = new Date(Date.UTC(currentYear, month, 0)); // last day of month
    await prisma.accountingPeriod.upsert({
      where: { fiscalYearId_periodNumber: { fiscalYearId: fiscalYear.id, periodNumber: month } },
      update: {},
      create: {
        fiscalYearId: fiscalYear.id,
        periodNumber: month,
        name: `${monthNames[month - 1]} ${currentYear}`,
        startDate,
        endDate,
        status: 'open',
      },
    });
  }

  // ── Seed admin user (dev/bootstrap credential — see constant above) ──
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);
  const adminUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'admin' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'admin',
      email: 'admin@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const adminRole = roles.ADMIN;
  if (!adminRole) throw new Error('Seed error: ADMIN role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: adminUser.id,
        roleId: adminRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed budget approver test user ──
  const approverUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'approver' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'approver',
      email: 'approver@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const budgetApproverRole = roles.BUDGET_APPROVER;
  if (!budgetApproverRole) throw new Error('Seed error: BUDGET_APPROVER role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: approverUser.id,
        roleId: budgetApproverRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: approverUser.id,
      roleId: budgetApproverRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed budget officer test user ──
  const officerUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'budget_officer' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'budget_officer',
      email: 'budget.officer@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const budgetOfficerRole = roles.BUDGET_OFFICER;
  if (!budgetOfficerRole) throw new Error('Seed error: BUDGET_OFFICER role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: officerUser.id,
        roleId: budgetOfficerRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: officerUser.id,
      roleId: budgetOfficerRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed procurement officer test user ──
  const procOfficerUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'procurement_officer' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'procurement_officer',
      email: 'procurement.officer@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const procOfficerRole = roles.PROCUREMENT_OFFICER;
  if (!procOfficerRole) throw new Error('Seed error: PROCUREMENT_OFFICER role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: procOfficerUser.id,
        roleId: procOfficerRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: procOfficerUser.id,
      roleId: procOfficerRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed a test department (for department-head scoping) ──
  const deptUnit = await prisma.organizationalUnit.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'ADMIN-DEPT' } },
    update: {},
    create: {
      organizationId: organization.id,
      code: 'ADMIN-DEPT',
      name: 'Administrative Department',
      unitType: 'department',
      parentUnitId: rootUnit.id,
    },
  });

  const testDepartment = await prisma.department.upsert({
    where: { organizationalUnitId: deptUnit.id },
    update: {},
    create: {
      organizationId: organization.id,
      organizationalUnitId: deptUnit.id,
      code: 'ADMIN',
      name: 'Administrative Department',
    },
  });

  // ── Seed responsibility centers ──
  const rcDefinitions = [
    { code: 'RC-ADMIN', name: 'Administrative Services', unitCode: 'ADMIN-DEPT' },
    { code: 'RC-OGM', name: 'Office of the General Manager', unitCode: 'ROOT' },
  ];
  for (const rc of rcDefinitions) {
    const unit = rc.unitCode === 'ROOT' ? rootUnit : deptUnit;
    await prisma.responsibilityCenter.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: rc.code } },
      update: {},
      create: {
        organizationId: organization.id,
        organizationalUnitId: unit.id,
        code: rc.code,
        name: rc.name,
      },
    });
  }
  console.log('  Responsibility centers seeded: ' + rcDefinitions.map((r) => r.code).join(', '));

  // ── Seed fund sources ──
  const fundSourceDefinitions = [
    { code: 'GF', name: 'General Fund', description: 'Main operating fund from water service revenues.' },
    { code: 'SF', name: 'Special Fund', description: 'Earmarked funds for specific projects or purposes.' },
    { code: 'TF', name: 'Trust Fund', description: 'Funds held in trust for external obligations.' },
  ];
  for (const fs of fundSourceDefinitions) {
    await prisma.fundSource.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: fs.code } },
      update: {},
      create: {
        organizationId: organization.id,
        code: fs.code,
        name: fs.name,
        description: fs.description,
      },
    });
  }
  console.log('  Fund sources seeded: ' + fundSourceDefinitions.map((f) => f.code).join(', '));

  // ── Seed locations ──
  const locationDefinitions = [
    { code: 'MAIN', name: 'Main Office — Siquijor' },
    { code: 'WH', name: 'Warehouse' },
  ];
  for (const loc of locationDefinitions) {
    await prisma.location.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: loc.code } },
      update: {},
      create: {
        organizationId: organization.id,
        code: loc.code,
        name: loc.name,
      },
    });
  }
  console.log('  Locations seeded: ' + locationDefinitions.map((l) => l.code).join(', '));

  // ── Seed end-user / employee test user ──
  const endUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'end_user' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'end_user',
      email: 'end.user@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const employeeRole = roles.EMPLOYEE;
  if (!employeeRole) throw new Error('Seed error: EMPLOYEE role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: endUser.id,
        roleId: employeeRole.id,
        organizationalUnitId: deptUnit.id,
      },
    },
    update: {},
    create: {
      userId: endUser.id,
      roleId: employeeRole.id,
      organizationalUnitId: deptUnit.id,
    },
  });

  // ── Seed department head test user ──
  const deptHeadUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'dept_head' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'dept_head',
      email: 'dept.head@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const deptHeadRole = roles.DEPARTMENT_HEAD;
  if (!deptHeadRole) throw new Error('Seed error: DEPARTMENT_HEAD role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: deptHeadUser.id,
        roleId: deptHeadRole.id,
        organizationalUnitId: deptUnit.id,
      },
    },
    update: {},
    create: {
      userId: deptHeadUser.id,
      roleId: deptHeadRole.id,
      organizationalUnitId: deptUnit.id,
    },
  });

  // ── Seed general manager test user ──
  const gmUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'general_manager' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'general_manager',
      email: 'gm@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const gmRole = roles.GENERAL_MANAGER;
  if (!gmRole) throw new Error('Seed error: GENERAL_MANAGER role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: gmUser.id,
        roleId: gmRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: gmUser.id,
      roleId: gmRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed BAC member test user ──
  const bacUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'bac_member' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'bac_member',
      email: 'bac@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const bacRole = roles.BAC_MEMBER;
  if (!bacRole) throw new Error('Seed error: BAC_MEMBER role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: bacUser.id,
        roleId: bacRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: bacUser.id,
      roleId: bacRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed inspection officer test user ──
  const inspectionUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'inspection_officer' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'inspection_officer',
      email: 'inspector@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const inspectionRole = roles.INSPECTION_OFFICER;
  if (!inspectionRole) throw new Error('Seed error: INSPECTION_OFFICER role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: inspectionUser.id,
        roleId: inspectionRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: inspectionUser.id,
      roleId: inspectionRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── Seed accountant test user ──
  const accountantUser = await prisma.user.upsert({
    where: { organizationId_username: { organizationId: organization.id, username: 'accountant' } },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'accountant',
      email: 'accountant@example.invalid',
      passwordHash,
      isActive: true,
    },
  });

  const accountantRole = roles.ACCOUNTANT;
  if (!accountantRole) throw new Error('Seed error: ACCOUNTANT role was not created above.');

  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationalUnitId: {
        userId: accountantUser.id,
        roleId: accountantRole.id,
        organizationalUnitId: rootUnit.id,
      },
    },
    update: {},
    create: {
      userId: accountantUser.id,
      roleId: accountantRole.id,
      organizationalUnitId: rootUnit.id,
    },
  });

  // ── UACS Chart of Accounts seed data ──
  // Hierarchical: level 1 = group (header), level 2 = major (header),
  // level 3 = sub/detail (postable). Based on the COA for NGAs/GOCCs.
  const coaGroups: Array<{
    code: string; name: string; type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    balance: 'debit' | 'credit'; level: number; parentCode?: string; isHeader: boolean; uacs?: string;
  }> = [
    // Level 1: Account Groups
    { code: '1', name: 'Assets', type: 'asset', balance: 'debit', level: 1, isHeader: true },
    { code: '2', name: 'Liabilities', type: 'liability', balance: 'credit', level: 1, isHeader: true },
    { code: '3', name: 'Equity', type: 'equity', balance: 'credit', level: 1, isHeader: true },
    { code: '4', name: 'Revenue', type: 'revenue', balance: 'credit', level: 1, isHeader: true },
    { code: '5', name: 'Expenses', type: 'expense', balance: 'debit', level: 1, isHeader: true },

    // Level 2: Major Accounts — Assets
    { code: '101', name: 'Cash and Cash Equivalents', type: 'asset', balance: 'debit', level: 2, parentCode: '1', isHeader: true },
    { code: '103', name: 'Receivables', type: 'asset', balance: 'debit', level: 2, parentCode: '1', isHeader: true },
    { code: '104', name: 'Inventories', type: 'asset', balance: 'debit', level: 2, parentCode: '1', isHeader: true },
    { code: '106', name: 'Property, Plant and Equipment', type: 'asset', balance: 'debit', level: 2, parentCode: '1', isHeader: true },
    { code: '107', name: 'Accumulated Depreciation', type: 'asset', balance: 'credit', level: 2, parentCode: '1', isHeader: true },

    // Level 2: Major Accounts — Liabilities
    { code: '201', name: 'Financial Liabilities', type: 'liability', balance: 'credit', level: 2, parentCode: '2', isHeader: true },
    { code: '202', name: 'Inter-Agency Payables', type: 'liability', balance: 'credit', level: 2, parentCode: '2', isHeader: true },
    { code: '204', name: 'Trust Liabilities', type: 'liability', balance: 'credit', level: 2, parentCode: '2', isHeader: true },

    // Level 2: Major Accounts — Equity
    { code: '301', name: 'Government Equity', type: 'equity', balance: 'credit', level: 2, parentCode: '3', isHeader: true },

    // Level 2: Major Accounts — Revenue
    { code: '402', name: 'Service and Business Income', type: 'revenue', balance: 'credit', level: 2, parentCode: '4', isHeader: true },
    { code: '407', name: 'Other Non-Operating Income', type: 'revenue', balance: 'credit', level: 2, parentCode: '4', isHeader: true },

    // Level 2: Major Accounts — Expenses
    { code: '501', name: 'Personnel Services', type: 'expense', balance: 'debit', level: 2, parentCode: '5', isHeader: true },
    { code: '502', name: 'Maintenance and Other Operating Expenses', type: 'expense', balance: 'debit', level: 2, parentCode: '5', isHeader: true },
    { code: '503', name: 'Financial Expenses', type: 'expense', balance: 'debit', level: 2, parentCode: '5', isHeader: true },

    // Level 3: Sub-Accounts — Cash
    { code: '10101010', name: 'Cash - Collecting Officers', type: 'asset', balance: 'debit', level: 3, parentCode: '101', isHeader: false, uacs: '10101010' },
    { code: '10101020', name: 'Cash in Bank - Local Currency, Current Account', type: 'asset', balance: 'debit', level: 3, parentCode: '101', isHeader: false, uacs: '10101020' },
    { code: '10101030', name: 'Cash in Bank - Local Currency, Savings Account', type: 'asset', balance: 'debit', level: 3, parentCode: '101', isHeader: false, uacs: '10101030' },
    { code: '10104010', name: 'Petty Cash Fund', type: 'asset', balance: 'debit', level: 3, parentCode: '101', isHeader: false, uacs: '10104010' },

    // Level 3: Receivables
    { code: '10301010', name: 'Accounts Receivable', type: 'asset', balance: 'debit', level: 3, parentCode: '103', isHeader: false, uacs: '10301010' },
    { code: '10301990', name: 'Other Receivables', type: 'asset', balance: 'debit', level: 3, parentCode: '103', isHeader: false, uacs: '10301990' },

    // Level 3: Inventories
    { code: '10404010', name: 'Office Supplies Inventory', type: 'asset', balance: 'debit', level: 3, parentCode: '104', isHeader: false, uacs: '10404010' },
    { code: '10404020', name: 'Accountable Forms, Plates and Stickers', type: 'asset', balance: 'debit', level: 3, parentCode: '104', isHeader: false, uacs: '10404020' },
    { code: '10404060', name: 'Drugs and Medicines Inventory', type: 'asset', balance: 'debit', level: 3, parentCode: '104', isHeader: false, uacs: '10404060' },
    { code: '10404070', name: 'Chemical and Filtering Supplies Inventory', type: 'asset', balance: 'debit', level: 3, parentCode: '104', isHeader: false, uacs: '10404070' },
    { code: '10404990', name: 'Other Supplies and Materials Inventory', type: 'asset', balance: 'debit', level: 3, parentCode: '104', isHeader: false, uacs: '10404990' },

    // Level 3: PPE
    { code: '10601010', name: 'Land', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10601010' },
    { code: '10604010', name: 'Buildings', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10604010' },
    { code: '10605010', name: 'Machinery and Equipment', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10605010' },
    { code: '10605020', name: 'Office Equipment', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10605020' },
    { code: '10605030', name: 'ICT Equipment', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10605030' },
    { code: '10605060', name: 'Motor Vehicles', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10605060' },
    { code: '10605070', name: 'Furniture and Fixtures', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10605070' },
    { code: '10605990', name: 'Other Machinery and Equipment', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10605990' },
    { code: '10606010', name: 'Water Supply Systems', type: 'asset', balance: 'debit', level: 3, parentCode: '106', isHeader: false, uacs: '10606010' },

    // Level 3: Accumulated Depreciation
    { code: '10704010', name: 'Accumulated Depreciation - Buildings', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10704010' },
    { code: '10705010', name: 'Accumulated Depreciation - Machinery and Equipment', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10705010' },
    { code: '10705020', name: 'Accumulated Depreciation - Office Equipment', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10705020' },
    { code: '10705030', name: 'Accumulated Depreciation - ICT Equipment', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10705030' },
    { code: '10705060', name: 'Accumulated Depreciation - Motor Vehicles', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10705060' },
    { code: '10705070', name: 'Accumulated Depreciation - Furniture and Fixtures', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10705070' },
    { code: '10706010', name: 'Accumulated Depreciation - Water Supply Systems', type: 'asset', balance: 'credit', level: 3, parentCode: '107', isHeader: false, uacs: '10706010' },

    // Level 3: Liabilities
    { code: '20101010', name: 'Accounts Payable', type: 'liability', balance: 'credit', level: 3, parentCode: '201', isHeader: false, uacs: '20101010' },
    { code: '20101020', name: 'Due to Officers and Employees', type: 'liability', balance: 'credit', level: 3, parentCode: '201', isHeader: false, uacs: '20101020' },
    { code: '20201010', name: 'Due to BIR', type: 'liability', balance: 'credit', level: 3, parentCode: '202', isHeader: false, uacs: '20201010' },
    { code: '20201020', name: 'Due to GSIS', type: 'liability', balance: 'credit', level: 3, parentCode: '202', isHeader: false, uacs: '20201020' },
    { code: '20201030', name: 'Due to Pag-IBIG', type: 'liability', balance: 'credit', level: 3, parentCode: '202', isHeader: false, uacs: '20201030' },
    { code: '20201040', name: 'Due to PhilHealth', type: 'liability', balance: 'credit', level: 3, parentCode: '202', isHeader: false, uacs: '20201040' },
    { code: '20401010', name: 'Trust Liabilities', type: 'liability', balance: 'credit', level: 3, parentCode: '204', isHeader: false, uacs: '20401010' },
    { code: '20401040', name: 'Customers\' Deposits', type: 'liability', balance: 'credit', level: 3, parentCode: '204', isHeader: false, uacs: '20401040' },

    // Level 3: Equity
    { code: '30101010', name: 'Government Equity', type: 'equity', balance: 'credit', level: 3, parentCode: '301', isHeader: false, uacs: '30101010' },
    { code: '30104010', name: 'Retained Earnings / Accumulated Surplus (Deficit)', type: 'equity', balance: 'credit', level: 3, parentCode: '301', isHeader: false, uacs: '30104010' },

    // Level 3: Revenue
    { code: '40201010', name: 'Water Sales Revenue', type: 'revenue', balance: 'credit', level: 3, parentCode: '402', isHeader: false, uacs: '40201010' },
    { code: '40201020', name: 'Connection Fees', type: 'revenue', balance: 'credit', level: 3, parentCode: '402', isHeader: false, uacs: '40201020' },
    { code: '40201030', name: 'Reconnection Fees', type: 'revenue', balance: 'credit', level: 3, parentCode: '402', isHeader: false, uacs: '40201030' },
    { code: '40201990', name: 'Other Service Income', type: 'revenue', balance: 'credit', level: 3, parentCode: '402', isHeader: false, uacs: '40201990' },
    { code: '40701010', name: 'Miscellaneous Income', type: 'revenue', balance: 'credit', level: 3, parentCode: '407', isHeader: false, uacs: '40701010' },

    // Level 3: Personnel Services
    { code: '50101010', name: 'Salaries and Wages - Regular', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50101010' },
    { code: '50101020', name: 'Salaries and Wages - Casual/Contractual', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50101020' },
    { code: '50102010', name: 'Personnel Benefit Contributions - GSIS', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50102010' },
    { code: '50102020', name: 'Personnel Benefit Contributions - Pag-IBIG', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50102020' },
    { code: '50102030', name: 'Personnel Benefit Contributions - PhilHealth', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50102030' },
    { code: '50103010', name: 'Retirement and Life Insurance Premiums', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50103010' },
    { code: '50104010', name: 'Year-End Bonus', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50104010' },
    { code: '50104030', name: 'Cash Gift', type: 'expense', balance: 'debit', level: 3, parentCode: '501', isHeader: false, uacs: '50104030' },

    // Level 3: MOOE
    { code: '50201010', name: 'Traveling Expenses - Local', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50201010' },
    { code: '50202010', name: 'Training Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50202010' },
    { code: '50203010', name: 'Office Supplies Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50203010' },
    { code: '50203020', name: 'Accountable Forms Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50203020' },
    { code: '50203070', name: 'Drugs and Medicines Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50203070' },
    { code: '50203080', name: 'Chemical and Filtering Supplies Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50203080' },
    { code: '50203990', name: 'Other Supplies and Materials Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50203990' },
    { code: '50204010', name: 'Water Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50204010' },
    { code: '50204020', name: 'Electricity Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50204020' },
    { code: '50205010', name: 'Telephone Expenses - Landline', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50205010' },
    { code: '50205020', name: 'Telephone Expenses - Mobile', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50205020' },
    { code: '50205030', name: 'Internet Subscription Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50205030' },
    { code: '50211010', name: 'Legal Services', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50211010' },
    { code: '50211020', name: 'Auditing Services', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50211020' },
    { code: '50211990', name: 'Other Professional Services', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50211990' },
    { code: '50212020', name: 'Janitorial Services', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50212020' },
    { code: '50212030', name: 'Security Services', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50212030' },
    { code: '50213040', name: 'R&M - Buildings and Other Structures', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50213040' },
    { code: '50213050', name: 'R&M - Machinery and Equipment', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50213050' },
    { code: '50213060', name: 'R&M - Motor Vehicles', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50213060' },
    { code: '50213070', name: 'R&M - Water Supply Systems', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50213070' },
    { code: '50214010', name: 'Depreciation - Buildings', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214010' },
    { code: '50214050', name: 'Depreciation - Machinery and Equipment', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214050' },
    { code: '50214060', name: 'Depreciation - Office Equipment', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214060' },
    { code: '50214070', name: 'Depreciation - ICT Equipment', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214070' },
    { code: '50214100', name: 'Depreciation - Motor Vehicles', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214100' },
    { code: '50214110', name: 'Depreciation - Furniture and Fixtures', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214110' },
    { code: '50214120', name: 'Depreciation - Water Supply Systems', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50214120' },
    { code: '50215010', name: 'Taxes, Duties and Licenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50215010' },
    { code: '50216010', name: 'Fidelity Bond Premiums', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50216010' },
    { code: '50216020', name: 'Insurance Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50216020' },
    { code: '50299990', name: 'Other Maintenance and Operating Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '502', isHeader: false, uacs: '50299990' },

    // Level 3: Financial Expenses
    { code: '50301010', name: 'Interest Expenses', type: 'expense', balance: 'debit', level: 3, parentCode: '503', isHeader: false, uacs: '50301010' },
    { code: '50301020', name: 'Bank Charges', type: 'expense', balance: 'debit', level: 3, parentCode: '503', isHeader: false, uacs: '50301020' },
  ];

  // Build COA in order: level 1, then 2, then 3 (parent must exist before child)
  const coaMap: Record<string, string> = {};
  for (const lvl of [1, 2, 3]) {
    for (const acct of coaGroups.filter((a) => a.level === lvl)) {
      const parentId = acct.parentCode ? coaMap[acct.parentCode] : undefined;
      const row = await prisma.chartOfAccount.upsert({
        where: { organizationId_accountCode: { organizationId: organization.id, accountCode: acct.code } },
        update: { name: acct.name },
        create: {
          organizationId: organization.id,
          accountCode: acct.code,
          name: acct.name,
          accountType: acct.type,
          normalBalance: acct.balance,
          level: acct.level,
          isHeader: acct.isHeader,
          ...(acct.uacs ? { uacsCode: acct.uacs } : {}),
          ...(parentId ? { parentAccountId: parentId } : {}),
        },
      });
      coaMap[acct.code] = row.id;
    }
  }
  console.log(`  Chart of Accounts seeded: ${coaGroups.length} accounts`);

  console.log('Seed complete:');
  console.log(`  Organization: ${organization.name} (${organization.code})`);
  console.log(`  Fiscal year: FY${currentYear} with 12 accounting periods`);
  console.log(`  Roles seeded: ${roleDefinitions.map((r) => r.code).join(', ')}`);
  console.log(`  Permissions seeded: ${permissionDefinitions.length}`);
  console.log(`  Department seeded: ${testDepartment.name} (${testDepartment.code})`);
  console.log(`  Admin login: username "admin", password "${SEED_ADMIN_PASSWORD}" — CHANGE THIS immediately after first login.`);
  console.log(`  Budget Officer login: username "budget_officer", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  Budget Approver login: username "approver", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  Procurement Officer login: username "procurement_officer", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  End-User login: username "end_user", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  Department Head login: username "dept_head", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  General Manager login: username "general_manager", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  BAC Member login: username "bac_member", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  Inspection Officer login: username "inspection_officer", password "${SEED_ADMIN_PASSWORD}"`);
  console.log(`  Accountant login: username "accountant", password "${SEED_ADMIN_PASSWORD}"`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
