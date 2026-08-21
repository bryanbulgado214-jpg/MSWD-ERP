/**
 * DEMO SEED — Sta. Barbara Water District (SBWD)
 * ------------------------------------------------------------------
 * Creates a SELF-CONTAINED, fully-functional demonstration organization
 * with its own users, roles, chart of accounts, fiscal year/periods, and
 * six months (Jan–Jun 2026) of balanced, internally-consistent, POSTED
 * journal entries — so the General Ledger, Trial Balance, Financial
 * Statements, and Accounting Dashboard all show real, tie-out numbers.
 *
 * This is DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS.
 *
 * Safe to re-run (idempotent): org / users / roles / COA / periods are
 * upserted; the transactional JEVs for this org are wiped and rebuilt on
 * every run, so it doubles as the "reset" script. It NEVER touches any
 * other organization's data.
 *
 * Run:  npx ts-node prisma/seed-demo-sbwd.ts       (from apps/api)
 * or:   npm run seed:demo                           (see package.json)
 *
 * Design note — why no contra-asset accounts (e.g. Accumulated
 * Depreciation): the Financial Statements service sums each account's
 * balance by account_type using the account's own normal side, with no
 * contra-account handling, so a credit-normal asset would be ADDED to
 * (not subtracted from) total assets and break the A = L + E tie-out.
 * The demo therefore carries PPE at net book value and runs no
 * depreciation (depreciation is not in the demo transaction set). This
 * is documented in DEMO-SCRIPT.md's open-items list.
 */
import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ORG_CODE = 'SBWD';
const ORG_NAME = 'Sta. Barbara Water District';
const DEMO_PASSWORD = 'ChangeMe!2026';
const SIMPLE_PASSWORD = 'demo1234'; // for the three multi-device workflow users
const FY_YEAR = 2026;
const DISTRICT_ADDRESS = 'Rizal Street, Poblacion, Sta. Barbara, Iloilo 5002';
const DISTRICT_CONTACT = 'Tel. (033) 523-0000 • sbwd@example.invalid';

/** Sets app.current_user_id for the audit trigger, inside a transaction. */
async function runAudited<T>(
  actorUserId: string | null,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_user_id', ${actorUserId ?? ''}, true)`,
    );
    return work(tx);
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ────────────────────────────────────────────────────────────────────
// Chart of Accounts — a small, clearly-sample chart on the standard
// class structure (1 Assets, 2 Liabilities, 3 Equity, 4 Income,
// 5 Expenses). NO contra-normal accounts (see header note).
// ────────────────────────────────────────────────────────────────────
type Coa = {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: 'debit' | 'credit';
  level: number;
  parentCode?: string;
  isHeader: boolean;
  uacs?: string;
};

// Real UACS chart of accounts, parsed from the Sta. Barbara "TB December 2025"
// workbook into prisma/sbwd-coa.json (396 accounts across 5 levels; header vs.
// postable and normal balances derived from the trial balance).
const COA: Coa[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'sbwd-coa.json'), 'utf8'));

// The balanced 6-month demo narrative is written against simple logical codes;
// this maps each to a genuine account in the real chart so the posted entries,
// Trial Balance, and Financial Statements all reference actual UACS accounts.
const MAP: Record<string, string> = {
  '10101': '1-01-01-010', // Cash - Collecting Officer
  '10102': '1-01-02-020-02', // Cash in Bank - Local Currency, DBP Current Account
  '10201': '1-03-01-010', // Accounts Receivable
  '10301': '1-04-04-120', // Chemicals and Filtering Supplies Inventory
  '10601': '1-06-03-040', // Water Supply Systems
  '10602': '1-06-05-020', // Office Equipment
  '10603': '1-06-06-010', // Motor Vehicles
  '20101': '2-01-01-010', // Accounts Payable
  '20102': '2-01-02-040-02', // Loans Payable - Long Term Debt
  '20201': '2-02-01-010-01', // Due to BIR - Withholding Tax on Compensation
  '20202': '2-02-01-020-01', // Due to GSIS - Life and Retirement Premium
  '20203': '2-02-01-030-01', // Due to Pag-IBIG - Premium
  '20204': '2-02-01-040', // Due to PhilHealth
  '30101': '3-01-01-020', // Government Equity
  '30102': '3-01-01-010', // Accumulated Surplus / (Deficit)
  '40201': '4-02-02-090-01', // Metered Sales (water)
  '40202': '4-02-02-160', // Sales Revenue (Water Sales)
  '40701': '4-02-02-210', // Interest Income
  '40702': '4-06-03-990', // Miscellaneous Income
  '50101': '5-01-01-010', // Salaries and Wages - Regular
  '50102': '5-01-03-010', // Retirement and Life Insurance Premiums
  '50201': '5-02-04-020', // Electricity Expenses
  '50202': '5-02-03-130', // Chemical and Filtering Supplies Expense (Water Treatment)
  '50203': '5-02-13-030', // Repairs and Maintenance - Infrastructure Assets
  '50204': '5-02-03-010', // Office Supplies Expenses
  '50301': '5-03-01-020', // Interest Expenses
  '50302': '5-03-01-040', // Bank Charges
};

const MONTHS = [
  { m: 1, name: 'January', factor: 1.0 },
  { m: 2, name: 'February', factor: 0.96 },
  { m: 3, name: 'March', factor: 1.05 },
  { m: 4, name: 'April', factor: 1.1 },
  { m: 5, name: 'May', factor: 1.14 },
  { m: 6, name: 'June', factor: 1.03 },
];

async function main() {
  console.log(`\nSeeding DEMONSTRATION organization: ${ORG_NAME} (${ORG_CODE})`);
  console.log('This is DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS.\n');

  // 1. Organization + settings ------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    update: { name: ORG_NAME },
    create: { code: ORG_CODE, name: ORG_NAME, isActive: true },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: org.id },
    update: {
      legalName: ORG_NAME,
      address: DISTRICT_ADDRESS,
      contact: DISTRICT_CONTACT,
      logoUrl: '/aquabooks-mark.png',
    },
    create: {
      organizationId: org.id,
      legalName: ORG_NAME,
      defaultCurrencyCode: 'PHP',
      fiscalYearStartMonth: 1,
      timezone: 'Asia/Manila',
      address: DISTRICT_ADDRESS,
      contact: DISTRICT_CONTACT,
      logoUrl: '/aquabooks-mark.png',
    },
  });

  // 2. Root organizational unit (required by UserRole) ------------------------
  const rootUnit = await prisma.organizationalUnit.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'ROOT' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'ROOT',
      name: `${ORG_NAME} (Organization-Wide)`,
      unitType: 'organization_wide',
    },
  });

  // 3. Roles (per-organization) ------------------------------------------------
  const roleDefs = [
    { code: 'ADMIN', name: 'System Administrator' },
    { code: 'GENERAL_MANAGER', name: 'General Manager' },
    { code: 'ACCOUNTANT', name: 'Accountant' },
    { code: 'BUDGET_OFFICER', name: 'Budget Officer' },
    { code: 'BUDGET_APPROVER', name: 'Budget Approver' },
    { code: 'CASHIER', name: 'Cashier' },
    // Three narrow JEV workflow roles for the multi-device separation-of-duties
    // demo — each holds exactly one stage's permission.
    { code: 'JEV_PREPARER', name: 'JEV Preparer' },
    { code: 'JEV_REVIEWER', name: 'JEV Reviewer' },
    { code: 'JEV_POSTER', name: 'JEV Approver & Poster' },
  ];
  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefs) {
    roles[def.code] = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: org.id, code: def.code } },
      update: { name: def.name },
      create: { organizationId: org.id, code: def.code, name: def.name, isSystemRole: true },
    });
  }

  // 4. Grants (permissions are GLOBAL — read the catalog, grant by code) ------
  // Ensure the Accounting-side Disbursement Voucher permissions exist (added to
  // the catalog after the base seed) so the ACCOUNTANT role picks them up below.
  for (const perm of [
    { code: 'accounting.dv.read', name: 'View Disbursement Vouchers', module: 'accounting' },
    { code: 'accounting.dv.create', name: 'Create Disbursement Vouchers', module: 'accounting' },
    { code: 'accounting.check.read', name: 'View Check Register', module: 'accounting' },
    {
      code: 'accounting.check.assign_number',
      name: 'Assign/Confirm Check Number',
      module: 'accounting',
    },
    { code: 'accounting.check.print', name: 'Print Check', module: 'accounting' },
    { code: 'accounting.check.record_release', name: 'Record Check Release', module: 'accounting' },
    { code: 'accounting.check.void', name: 'Void/Spoil Check', module: 'accounting' },
    {
      code: 'accounting.check.update_clearing',
      name: 'Update Check Clearing Info',
      module: 'accounting',
    },
  ]) {
    await prisma.permission.upsert({ where: { code: perm.code }, update: {}, create: perm });
  }
  const allPerms = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permByCode = new Map(allPerms.map((p) => [p.code, p.id]));
  const grant = async (roleCode: string, code: string) => {
    const roleId = roles[roleCode]?.id;
    const permissionId = permByCode.get(code);
    if (!roleId || !permissionId) return; // permission may not exist yet; skip quietly
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  };

  const accountingCodes = allPerms.map((p) => p.code).filter((c) => c.startsWith('accounting.'));
  // Check disbursement — segregation of duties:
  //  • CASHIER disburses: view register, print (assign #), record release. No void.
  //  • GENERAL_MANAGER is the dedicated check-void approver (and can't void what
  //    it prepared/printed/released — enforced in check.service).
  //  • ACCOUNTANT/ADMIN only VIEW the register (accounting.check.read).
  const CHECK_CODES = [
    'accounting.check.read',
    'accounting.check.print',
    'accounting.check.record_release',
    'accounting.check.void',
    'accounting.check.assign_number',
    'accounting.check.update_clearing',
  ];
  const isCheckActionCode = (c: string) => CHECK_CODES.includes(c) && c !== 'accounting.check.read';

  // Accountant: ACCOUNTING + a few cross-module financial VIEWS — the fixed-asset
  // register & depreciation (lapsing) schedule (asset.read/reports) and the
  // receivables aging report (billing.reports). No operational budgeting /
  // procurement / billing tabs. Check ACTIONS excluded (keeps check.read).
  // Report-only cross-module grants — surface under the Reports tab (fixed-asset
  // lapsing schedule, AR aging), NOT the Asset/Billing modules themselves.
  const accountantCross = ['asset.reports', 'billing.reports'];
  for (const c of accountingCodes) {
    if (isCheckActionCode(c)) continue;
    await grant('ACCOUNTANT', c);
  }
  for (const c of accountantCross) await grant('ACCOUNTANT', c);
  // Strip any OTHER budgeting/procurement/billing/asset grants a prior seed gave
  // the accountant, keeping only the cross-module report views above.
  {
    const accountantRoleId = roles['ACCOUNTANT']?.id;
    if (accountantRoleId) {
      const keep = new Set(accountantCross);
      const stripIds = allPerms
        .filter((p) => /^(budgeting|procurement|billing|asset)\./.test(p.code) && !keep.has(p.code))
        .map((p) => p.id);
      if (stripIds.length) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: accountantRoleId, permissionId: { in: stripIds } },
        });
      }
    }
  }
  // Admin: everything EXCEPT the SoD-reserved acts (post/void/reverse) AND every
  // check ACTION — checks stay strictly cashier(print/release) + GM(void).
  const adminExcluded = new Set([
    'accounting.jev.post',
    'accounting.jev.void',
    'accounting.jev.reverse',
    'accounting.period.manage',
    'accounting.reconcile',
    ...CHECK_CODES.filter((c) => c !== 'accounting.check.read'),
  ]);
  for (const p of allPerms) {
    if (!adminExcluded.has(p.code)) await grant('ADMIN', p.code);
  }
  // General Manager: finance read/oversight + dedicated check-void approver.
  for (const c of [
    'accounting.read',
    'accounting.reports',
    'budgeting.read',
    'billing.read',
    'billing.reports',
    'accounting.check.read',
    'accounting.check.void',
  ]) {
    await grant('GENERAL_MANAGER', c);
  }
  // Cashier: disburses checks only. Views the register + the DV backing a check;
  // assigns the number, prints, records release. NO accounting.read (no GL/TB/FS),
  // no DV create (no GL posting), and CANNOT void a check.
  for (const c of [
    'accounting.check.read',
    'accounting.dv.read',
    'accounting.check.print',
    'accounting.check.record_release',
  ]) {
    await grant('CASHIER', c);
  }

  // Deterministic cleanup — a prior seed over-granted check.*/accounting.read.
  // Set each role's check.* membership EXACTLY (revoke anything not desired).
  const desiredCheck: Record<string, string[]> = {
    CASHIER: ['accounting.check.read', 'accounting.check.print', 'accounting.check.record_release'],
    GENERAL_MANAGER: ['accounting.check.read', 'accounting.check.void'],
    ACCOUNTANT: ['accounting.check.read'],
    ADMIN: ['accounting.check.read'],
    JEV_PREPARER: [],
    JEV_REVIEWER: [],
    JEV_POSTER: [],
  };
  for (const [roleCode, desired] of Object.entries(desiredCheck)) {
    const roleId = roles[roleCode]?.id;
    if (!roleId) continue;
    const revokeIds = CHECK_CODES.filter((c) => !desired.includes(c))
      .map((c) => permByCode.get(c))
      .filter((id): id is string => Boolean(id));
    if (revokeIds.length) {
      await prisma.rolePermission.deleteMany({
        where: { roleId, permissionId: { in: revokeIds } },
      });
    }
  }
  // Cashier must NOT retain accounting.read (it would expose GL / trial balance /
  // financial statements) — strip it if an earlier seed granted it.
  const cashierRoleId = roles['CASHIER']?.id;
  const acctReadId = permByCode.get('accounting.read');
  if (cashierRoleId && acctReadId) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: cashierRoleId, permissionId: acctReadId },
    });
  }

  // Narrow JEV workflow roles — EXACTLY the permission for their one stage.
  for (const c of ['accounting.read', 'accounting.jev.create']) await grant('JEV_PREPARER', c);
  for (const c of ['accounting.read', 'accounting.jev.approve']) await grant('JEV_REVIEWER', c);
  for (const c of ['accounting.read', 'accounting.jev.post', 'accounting.jev.reverse'])
    await grant('JEV_POSTER', c);

  // 5. Users (globally-distinct usernames — login ignores org) ----------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const simpleHash = await bcrypt.hash(SIMPLE_PASSWORD, 12);
  const mkUser = async (
    username: string,
    email: string,
    roleCodes: string[],
    hash: string = passwordHash,
  ) => {
    const user = await prisma.user.upsert({
      where: { organizationId_username: { organizationId: org.id, username } },
      update: { email, passwordHash: hash, isActive: true },
      create: { organizationId: org.id, username, email, passwordHash: hash, isActive: true },
    });
    for (const rc of roleCodes) {
      const roleId = roles[rc]?.id;
      if (!roleId) continue;
      await prisma.userRole.upsert({
        where: {
          userId_roleId_organizationalUnitId: {
            userId: user.id,
            roleId,
            organizationalUnitId: rootUnit.id,
          },
        },
        update: {},
        create: { userId: user.id, roleId, organizationalUnitId: rootUnit.id },
      });
    }
    return user;
  };

  const adminUser = await mkUser('sbwd.admin', 'admin@sbwd.invalid', ['ADMIN', 'GENERAL_MANAGER']);
  const accountantUser = await mkUser('sbwd.accountant', 'accountant@sbwd.invalid', ['ACCOUNTANT']);
  const approverUser = await mkUser('sbwd.approver', 'approver@sbwd.invalid', ['ACCOUNTANT']);
  const cashierUser = await mkUser('sbwd.cashier', 'cashier@sbwd.invalid', ['CASHIER']);
  await mkUser('sbwd.gm', 'gm@sbwd.invalid', ['GENERAL_MANAGER']);

  // Three multi-device demo users — simple credentials, one JEV stage each.
  await mkUser('preparer', 'preparer@sbwd.invalid', ['JEV_PREPARER'], simpleHash);
  await mkUser('reviewer', 'reviewer@sbwd.invalid', ['JEV_REVIEWER'], simpleHash);
  await mkUser('poster', 'poster@sbwd.invalid', ['JEV_POSTER'], simpleHash);

  // 6. Fund sources + responsibility center (nice-to-have JEV dimensions) -----
  for (const fs of [
    { code: 'GF', name: 'General Fund' },
    { code: 'CF', name: 'Corporate Operating Budget' },
  ]) {
    await prisma.fundSource.upsert({
      where: { organizationId_code: { organizationId: org.id, code: fs.code } },
      update: { name: fs.name },
      create: { organizationId: org.id, code: fs.code, name: fs.name },
    });
  }
  const generalFund = await prisma.fundSource.findFirst({
    where: { organizationId: org.id, code: 'GF' },
  });
  const rc = await prisma.responsibilityCenter.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'RC-FIN' } },
    update: {},
    create: {
      organizationId: org.id,
      organizationalUnitId: rootUnit.id,
      code: 'RC-FIN',
      name: 'Finance and Administrative Services',
    },
  });

  // 6b. Banks + bank accounts (the "Cash in Bank" accounts of the real chart) --
  const banks: Record<string, { id: string }> = {};
  for (const bk of [
    { code: 'LBP', name: 'Land Bank of the Philippines' },
    { code: 'DBP', name: 'Development Bank of the Philippines' },
  ]) {
    banks[bk.code] = await prisma.bank.upsert({
      where: { organizationId_code: { organizationId: org.id, code: bk.code } },
      update: { name: bk.name },
      create: { organizationId: org.id, code: bk.code, name: bk.name },
    });
  }
  const bankAccounts: Array<{
    bank: 'LBP' | 'DBP';
    number: string;
    name: string;
    type: 'checking' | 'savings';
    balance: number;
    isDefault?: boolean;
  }> = [
    {
      bank: 'LBP',
      number: '1912-1016-70',
      name: 'Current Account',
      type: 'checking',
      balance: 850000,
    },
    {
      bank: 'DBP',
      number: '0712-0397-8N030',
      name: 'Current Account (Operating)',
      type: 'checking',
      balance: 4621210,
      isDefault: true,
    },
    {
      bank: 'LBP',
      number: '1912-105-420',
      name: 'Current Account - Main Office',
      type: 'checking',
      balance: 320000,
    },
    {
      bank: 'LBP',
      number: '1911-06002-01',
      name: "Customers' Deposit Fund",
      type: 'savings',
      balance: 1450000,
    },
    { bank: 'LBP', number: '1911-0579-52', name: 'Reserve Fund', type: 'savings', balance: 980000 },
    {
      bank: 'DBP',
      number: '005023717126',
      name: 'Savings Account',
      type: 'savings',
      balance: 2150000,
    },
  ];
  for (const ba of bankAccounts) {
    await prisma.bankAccount.upsert({
      where: { organizationId_accountNumber: { organizationId: org.id, accountNumber: ba.number } },
      update: {
        accountName: ba.name,
        accountType: ba.type,
        currentBalance: ba.balance,
        isDefault: ba.isDefault ?? false,
        bankId: banks[ba.bank]!.id,
      },
      create: {
        organizationId: org.id,
        bankId: banks[ba.bank]!.id,
        ...(generalFund ? { fundSourceId: generalFund.id } : {}),
        accountNumber: ba.number,
        accountName: ba.name,
        accountType: ba.type,
        currentBalance: ba.balance,
        isDefault: ba.isDefault ?? false,
      },
    });
  }

  // 7. Fiscal year + 12 monthly periods (all open) ----------------------------
  const fy = await prisma.fiscalYear.upsert({
    where: { organizationId_year: { organizationId: org.id, year: FY_YEAR } },
    update: {},
    create: {
      organizationId: org.id,
      year: FY_YEAR,
      name: `FY${FY_YEAR}`,
      startDate: new Date(Date.UTC(FY_YEAR, 0, 1)),
      endDate: new Date(Date.UTC(FY_YEAR, 11, 31)),
      status: 'open',
    },
  });
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const periodByMonth: Record<number, string> = {};
  for (let month = 1; month <= 12; month++) {
    const p = await prisma.accountingPeriod.upsert({
      where: { fiscalYearId_periodNumber: { fiscalYearId: fy.id, periodNumber: month } },
      update: {},
      create: {
        fiscalYearId: fy.id,
        periodNumber: month,
        name: `${monthNames[month - 1]} ${FY_YEAR}`,
        startDate: new Date(Date.UTC(FY_YEAR, month - 1, 1)),
        endDate: new Date(Date.UTC(FY_YEAR, month, 0)),
        status: 'open',
      },
    });
    periodByMonth[month] = p.id;
  }

  // 8. Chart of accounts (level-ordered so parents exist first) ---------------
  // Wipe this org's transactional data and chart first so a re-run cleanly
  // rebuilds the real chart. Order matters: JEV lines FK to accounts (JEVs
  // first); the chart's self-referential parent FK is RESTRICT, so clear
  // parent links before the bulk delete.
  await prisma.jevLine.deleteMany({ where: { jev: { organizationId: org.id } } });
  await prisma.journalEntryVoucher.deleteMany({ where: { organizationId: org.id } });
  await prisma.accountMapping.deleteMany({ where: { organizationId: org.id } });
  await prisma.chartOfAccount.updateMany({
    where: { organizationId: org.id },
    data: { parentAccountId: null },
  });
  await prisma.chartOfAccount.deleteMany({ where: { organizationId: org.id } });

  const coaId: Record<string, string> = {};
  for (const lvl of [1, 2, 3, 4, 5]) {
    for (const a of COA.filter((x) => x.level === lvl)) {
      const parentId = a.parentCode ? coaId[a.parentCode] : undefined;
      const row = await prisma.chartOfAccount.upsert({
        where: { organizationId_accountCode: { organizationId: org.id, accountCode: a.code } },
        update: {
          name: a.name,
          accountType: a.type,
          normalBalance: a.balance,
          isHeader: a.isHeader,
        },
        create: {
          organizationId: org.id,
          accountCode: a.code,
          name: a.name,
          accountType: a.type,
          normalBalance: a.balance,
          level: a.level,
          isHeader: a.isHeader,
          ...(a.uacs ? { uacsCode: a.uacs } : {}),
          ...(parentId ? { parentAccountId: parentId } : {}),
        },
      });
      coaId[a.code] = row.id;
    }
  }

  // 11b. Link each bank account to its Cash-in-Bank ledger account (rebuilt with
  // fresh ids above), matched by the account number embedded in the COA name.
  // This lets a Disbursement Voucher auto-credit the correct GL account.
  const cashCoa = COA.filter((a) => !a.isHeader && a.code.startsWith('1-01-02'));
  for (const ba of bankAccounts) {
    const match = cashCoa.find((a) => a.name.includes(ba.number));
    const coaRowId = match ? coaId[match.code] : undefined;
    if (coaRowId) {
      await prisma.bankAccount.updateMany({
        where: { organizationId: org.id, accountNumber: ba.number },
        data: { chartOfAccountId: coaRowId },
      });
    }
  }

  // 11c. Posting-account mappings the auto-JEV engine resolves. The mappings
  // were cleared above; recreate the disbursement-cycle defaults so releasing a
  // DV (and any other auto-posted document) records to the ledger instead of
  // being blocked. Extend this table as more modules are integrated (payroll,
  // inventory, etc.). Keys must match those resolved in AutoJevService.
  const POSTING_MAPPINGS: Record<string, string> = {
    // Disbursement cycle
    'cash.in_bank': '1-01-02-020-02', // Cash in Bank - LC, DBP Current Account
    'ap.accounts_payable': '2-01-01-010', // Accounts Payable
    'ap.due_to_bir': '2-02-01-010-02', // Due to BIR - Expanded Withholding Tax
    // Revenue cycle (billing + collections)
    'ar.trade_receivable': '1-03-01-010', // Accounts Receivable
    'cash.collecting_officer': '1-01-01-010', // Cash - Collecting Officer
    'revenue.water_sales': '4-02-02-160', // Sales Revenue (Water Sales)
    'revenue.environmental': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
    'revenue.sewer': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
    'revenue.maintenance': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
    'revenue.other': '4-02-02-990-04', // Other Business Income - Other Water Revenue (default)
    'income.penalty': '4-02-02-230', // Fines and Penalties - Business Income
    'contra.discount': '4-02-02-161', // Sales Discount (contra-revenue)
  };
  for (const [mappingKey, code] of Object.entries(POSTING_MAPPINGS)) {
    const chartOfAccountId = coaId[code];
    if (!chartOfAccountId) continue;
    await prisma.accountMapping.upsert({
      where: { organizationId_mappingKey: { organizationId: org.id, mappingKey } },
      update: { chartOfAccountId, updatedBy: adminUser.id },
      create: {
        organizationId: org.id,
        mappingKey,
        chartOfAccountId,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      },
    });
  }

  // 10. JEV factory -----------------------------------------------------------
  let seq = 0;
  const nextJevNumber = () => `JEV-${FY_YEAR}-${String(++seq).padStart(6, '0')}`;
  const acct = (code: string): string => {
    const real = MAP[code] ?? code; // translate logical narrative codes to real UACS codes
    const id = coaId[real];
    if (!id) throw new Error(`Unknown account code in demo JEV: ${code} -> ${real}`);
    return id;
  };

  type Line = { code: string; debit?: number; credit?: number; description?: string };
  const postJev = async (month: number, day: number, particulars: string, lines: Line[]) => {
    const totalDebit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
    const totalCredit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(
        `Unbalanced demo JEV "${particulars}" (${month}/${day}): debit ${totalDebit} != credit ${totalCredit}`,
      );
    }
    const jevDate = new Date(Date.UTC(FY_YEAR, month - 1, day));
    const jevNumber = nextJevNumber();
    const accountingPeriodId = periodByMonth[month];
    if (!accountingPeriodId) throw new Error(`No period for month ${month}`);
    await runAudited(accountantUser.id, (tx) =>
      tx.journalEntryVoucher.create({
        data: {
          organizationId: org.id,
          jevNumber,
          jevDate,
          accountingPeriodId,
          sourceType: 'manual',
          particulars,
          responsibilityCenterId: rc.id,
          fundSourceId: generalFund?.id ?? null,
          totalDebit,
          totalCredit,
          status: 'posted',
          createdBy: accountantUser.id,
          updatedBy: approverUser.id,
          reviewedBy: approverUser.id,
          reviewedAt: jevDate,
          postedBy: approverUser.id,
          postedAt: jevDate,
          lines: {
            create: lines.map((l) => ({
              chartOfAccountId: acct(l.code),
              debitAmount: round2(l.debit ?? 0),
              creditAmount: round2(l.credit ?? 0),
              ...(l.description ? { description: l.description } : {}),
            })),
          },
        },
      }),
    );
  };

  // 11. Opening balances (Jan 1) — establishes a balanced starting position ---
  await postJev(1, 1, 'Opening balances as of January 1, 2026', [
    { code: '10102', debit: 3500000, description: 'Cash in bank' },
    { code: '10101', debit: 50000, description: 'Cash on hand' },
    { code: '10201', debit: 1200000, description: 'Water receivables' },
    { code: '10301', debit: 300000, description: 'Chemical supplies' },
    { code: '10601', debit: 9600000, description: 'Water supply systems (net)' },
    { code: '10602', debit: 500000, description: 'Office equipment (net)' },
    { code: '10603', debit: 1200000, description: 'Service vehicles (net)' },
    { code: '20101', credit: 250000, description: 'Trade payables' },
    { code: '20102', credit: 6000000, description: 'LWUA loan outstanding' },
    { code: '30101', credit: 8000000, description: 'Government equity' },
    { code: '30102', credit: 2100000, description: 'Accumulated surplus' },
  ]);
  // Debits: 3,500,000 + 50,000 + 1,200,000 + 300,000 + 9,600,000 + 500,000 + 1,200,000 = 16,350,000
  // Credits: 250,000 + 6,000,000 + 8,000,000 + 2,100,000 = 16,350,000  ✓

  // 12. Six months of recurring, balanced operating entries -------------------
  let prevWithholdings: number | null = null;
  for (const { m, name, factor } of MONTHS) {
    const bill = round2(800000 * factor);
    const collect = round2(bill * 0.94);
    const conn = round2(23000 + m * 2000);
    const power = round2(120000 * factor);
    const chemicals = round2(45000 * factor);
    const repairs = round2(m % 2 === 0 ? 42000 : 18000);
    const office = round2(11000 + m * 600);
    const interestIncome = round2(3800 + m * 350);
    const bankCharges = 1500;
    const loanPrincipal = 100000;
    const loanInterest = round2(30000 - m * 300);

    // Payroll withholdings
    const gross = 300000;
    const bir = 30000;
    const gsis = 27000;
    const pagibig = 3000;
    const philhealth = 6000;
    const withheld = bir + gsis + pagibig + philhealth; // 66,000
    const netPay = gross - withheld; // 234,000

    // Water sales billing (accrual)
    await postJev(m, 5, `Water sales billing — ${name} ${FY_YEAR}`, [
      { code: '10201', debit: bill, description: 'Bill water consumers' },
      { code: '40201', credit: bill, description: 'Water sales revenue' },
    ]);
    // Collections on water accounts
    await postJev(m, 10, `Collections on water accounts — ${name} ${FY_YEAR}`, [
      { code: '10102', debit: collect, description: 'Deposit collections' },
      { code: '10201', credit: collect, description: 'Settle receivables' },
    ]);
    // New service connection fees
    await postJev(m, 12, `Service connection fees — ${name} ${FY_YEAR}`, [
      { code: '10102', debit: conn },
      { code: '40202', credit: conn, description: 'New connection fees' },
    ]);
    // Payroll
    await postJev(m, 15, `Payroll — ${name} ${FY_YEAR}`, [
      { code: '50101', debit: gross, description: 'Gross salaries and wages' },
      { code: '10102', credit: netPay, description: 'Net pay to employees' },
      { code: '20201', credit: bir, description: 'Withholding tax' },
      { code: '20202', credit: gsis, description: 'GSIS contributions' },
      { code: '20203', credit: pagibig, description: 'Pag-IBIG contributions' },
      { code: '20204', credit: philhealth, description: 'PhilHealth contributions' },
    ]);
    // Remit prior month's withholdings to agencies
    if (prevWithholdings !== null) {
      await postJev(m, 18, `Remittance of statutory deductions — ${name} ${FY_YEAR}`, [
        { code: '20201', debit: bir, description: 'Remit to BIR' },
        { code: '20202', debit: gsis, description: 'Remit to GSIS' },
        { code: '20203', debit: pagibig, description: 'Remit to Pag-IBIG' },
        { code: '20204', debit: philhealth, description: 'Remit to PhilHealth' },
        { code: '10102', credit: withheld, description: 'Cash remittance' },
      ]);
    }
    // Electricity (power for pumping stations)
    await postJev(m, 20, `Electricity — pumping stations — ${name} ${FY_YEAR}`, [
      { code: '50201', debit: power, description: 'Power expense' },
      { code: '10102', credit: power },
    ]);
    // Water treatment chemicals
    await postJev(m, 21, `Water treatment chemicals — ${name} ${FY_YEAR}`, [
      { code: '50202', debit: chemicals, description: 'Chlorine and treatment chemicals' },
      { code: '10102', credit: chemicals },
    ]);
    // Repairs and maintenance
    await postJev(m, 22, `Repairs and maintenance — ${name} ${FY_YEAR}`, [
      { code: '50203', debit: repairs, description: 'Pipeline/pump repairs' },
      { code: '10102', credit: repairs },
    ]);
    // Office supplies
    await postJev(m, 23, `Office supplies — ${name} ${FY_YEAR}`, [
      { code: '50204', debit: office },
      { code: '10102', credit: office },
    ]);
    // LWUA loan amortization (principal + interest)
    await postJev(m, 25, `LWUA loan amortization — ${name} ${FY_YEAR}`, [
      { code: '20102', debit: loanPrincipal, description: 'Loan principal' },
      { code: '50301', debit: loanInterest, description: 'Loan interest' },
      { code: '10102', credit: round2(loanPrincipal + loanInterest) },
    ]);
    // Interest income on bank deposits
    await postJev(m, 28, `Interest income on deposits — ${name} ${FY_YEAR}`, [
      { code: '10102', debit: interestIncome },
      { code: '40701', credit: interestIncome, description: 'Bank interest' },
    ]);
    // Bank service charges
    await postJev(m, 28, `Bank service charges — ${name} ${FY_YEAR}`, [
      { code: '50302', debit: bankCharges },
      { code: '10102', credit: bankCharges },
    ]);

    prevWithholdings = withheld;
  }

  // 12.5 Minimal Budgeting data so the Budget module isn't empty for the
  //      demo tour (one approved budget for the Finance RC / General Fund).
  const budgetCycle = await prisma.budgetCycle.upsert({
    where: { organizationId_code: { organizationId: org.id, code: `FY${FY_YEAR}-CYCLE` } },
    update: {},
    create: {
      organizationId: org.id,
      fiscalYearId: fy.id,
      code: `FY${FY_YEAR}-CYCLE`,
      name: `FY${FY_YEAR} Budget Cycle`,
      status: 'active',
      createdBy: adminUser.id,
    },
  });
  const budgetVersion = await prisma.budgetVersion.upsert({
    where: { budgetCycleId_versionNumber: { budgetCycleId: budgetCycle.id, versionNumber: 1 } },
    update: {},
    create: {
      budgetCycleId: budgetCycle.id,
      versionNumber: 1,
      name: 'Original',
      status: 'approved',
      isCurrent: true,
      createdBy: adminUser.id,
    },
  });
  const budgetLineDefs = [
    { accountCode: '5-01-01-010', description: 'Salaries and Wages - Regular', amount: 3800000 },
    { accountCode: '5-02-04-020', description: 'Electricity Expenses', amount: 1600000 },
    {
      accountCode: '5-02-03-130',
      description: 'Water Treatment Chemicals Expense',
      amount: 600000,
    },
    {
      accountCode: '5-02-13-030',
      description: 'Repairs and Maintenance - Infrastructure',
      amount: 400000,
    },
  ];
  const budgetTotal = budgetLineDefs.reduce((s, l) => s + l.amount, 0);
  const budgetHeader = await prisma.budgetHeader.upsert({
    where: {
      budgetVersionId_responsibilityCenterId_fundSourceId: {
        budgetVersionId: budgetVersion.id,
        responsibilityCenterId: rc.id,
        fundSourceId: generalFund!.id,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      budgetVersionId: budgetVersion.id,
      responsibilityCenterId: rc.id,
      fundSourceId: generalFund!.id,
      currencyCode: 'PHP',
      totalAmount: budgetTotal,
      status: 'approved',
      createdBy: adminUser.id,
    },
  });
  for (const line of budgetLineDefs) {
    const existing = await prisma.budgetLine.findFirst({
      where: { budgetHeaderId: budgetHeader.id, accountCode: line.accountCode },
    });
    if (!existing) {
      await prisma.budgetLine.create({
        data: {
          budgetHeaderId: budgetHeader.id,
          accountCode: line.accountCode,
          description: line.description,
          amount: line.amount,
          createdBy: adminUser.id,
        },
      });
    }
  }
  const release =
    (await prisma.budgetRelease.findFirst({ where: { budgetHeaderId: budgetHeader.id } })) ??
    (await prisma.budgetRelease.create({
      data: {
        organizationId: org.id,
        budgetHeaderId: budgetHeader.id,
        releaseNumber: `REL-${FY_YEAR}-000001`,
        releaseDate: new Date(Date.UTC(FY_YEAR, 0, 15)),
        releasedAmount: budgetTotal,
        reservedAmount: 0,
        createdBy: adminUser.id,
      },
    }));

  // 12b. Sample procurement chain → released Disbursement Voucher (Appendix 32) -
  // One fully-processed DV so the COA-prescribed DV printout — including its
  // Box B accounting entry drawn from the posted JEV — is demonstrable
  // end to end. Fictional supplier and figures; not an actual record.
  {
    const dvGross = 150000;
    const dvTax = 1500; // 1% expanded withholding tax on goods
    const dvNet = round2(dvGross - dvTax);
    const jun = (d: number) => new Date(Date.UTC(FY_YEAR, 5, d)); // June FY_YEAR
    const CHEM_EXPENSE_UACS = MAP['50202']!; // Chemical & Filtering Supplies Expense

    const supplier =
      (await prisma.supplier.findFirst({
        where: { organizationId: org.id, name: 'AquaChem Supplies Trading' },
      })) ??
      (await prisma.supplier.create({
        data: {
          organizationId: org.id,
          name: 'AquaChem Supplies Trading',
          tin: '004-521-889-000',
          address: 'Bo. Obrero, Iloilo City',
          contactPerson: 'Ramon delos Santos',
          contactNumber: '(033) 337-1122',
          email: 'sales@aquachem.example.invalid',
          createdBy: adminUser.id,
        },
      }));

    const pr =
      (await prisma.purchaseRequest.findFirst({
        where: { organizationId: org.id, prNumber: `PR-${FY_YEAR}-0007` },
      })) ??
      (await prisma.purchaseRequest.create({
        data: {
          organizationId: org.id,
          prNumber: `PR-${FY_YEAR}-0007`,
          title: 'Water treatment chemicals — Q2 replenishment',
          description: 'Chlorine (HTH) and aluminum sulfate for treatment operations.',
          totalAmount: dvGross,
          status: 'completed',
          fiscalYearId: fy.id,
          fundSourceId: generalFund?.id ?? null,
          responsibilityCenterId: rc.id,
          purpose: 'Replenishment of water treatment chemical stock for Q2.',
          createdBy: accountantUser.id,
          updatedBy: accountantUser.id,
        },
      }));

    const po =
      (await prisma.purchaseOrder.findFirst({
        where: { organizationId: org.id, poNumber: `PO-${FY_YEAR}-0006` },
      })) ??
      (await prisma.purchaseOrder.create({
        data: {
          organizationId: org.id,
          poNumber: `PO-${FY_YEAR}-0006`,
          poDate: jun(2),
          purchaseRequestId: pr.id,
          supplierId: supplier.id,
          contractAmount: dvGross,
          awardDate: jun(2),
          modeOfProcurement: 'Small Value Procurement',
          deliveryTerms: '15 days from receipt of PO',
          paymentTerms: 'Full payment upon delivery and acceptance',
          status: 'approved',
          approvedBy: approverUser.id,
          approvedAt: jun(2),
          createdBy: accountantUser.id,
          updatedBy: accountantUser.id,
        },
      }));

    const caf =
      (await prisma.certificationOfAvailability.findFirst({
        where: { organizationId: org.id, cafNumber: `CAF-${FY_YEAR}-0006` },
      })) ??
      (await prisma.certificationOfAvailability.create({
        data: {
          organizationId: org.id,
          cafNumber: `CAF-${FY_YEAR}-0006`,
          certificationDate: jun(3),
          purchaseRequestId: pr.id,
          purchaseOrderId: po.id,
          supplierId: supplier.id,
          budgetReleaseId: release.id,
          fiscalYearId: fy.id,
          fundSourceId: generalFund!.id,
          responsibilityCenterId: rc.id,
          accountCode: CHEM_EXPENSE_UACS,
          certifiedAmount: dvGross,
          availableBefore: budgetTotal,
          availableAfter: round2(budgetTotal - dvGross),
          certifiedBy: accountantUser.id,
          certifiedAt: jun(3),
          status: 'certified',
          createdBy: accountantUser.id,
          updatedBy: accountantUser.id,
        },
      }));

    const ors =
      (await prisma.obligationRequest.findFirst({
        where: { organizationId: org.id, orsNumber: `ORS-${FY_YEAR}-0006` },
      })) ??
      (await prisma.obligationRequest.create({
        data: {
          organizationId: org.id,
          orsNumber: `ORS-${FY_YEAR}-0006`,
          orsDate: jun(4),
          cafId: caf.id,
          purchaseRequestId: pr.id,
          purchaseOrderId: po.id,
          supplierId: supplier.id,
          budgetReleaseId: release.id,
          fundSourceId: generalFund!.id,
          responsibilityCenterId: rc.id,
          accountCode: CHEM_EXPENSE_UACS,
          originalAmount: dvGross,
          adjustedAmount: dvGross,
          cumulativePayable: dvGross,
          cumulativePaid: dvGross,
          remainingUnpaid: 0,
          obligationPostingDate: jun(4),
          status: 'fully_paid',
          createdBy: accountantUser.id,
          updatedBy: accountantUser.id,
        },
      }));

    const dv =
      (await prisma.disbursementVoucher.findFirst({
        where: { organizationId: org.id, dvNumber: `DV-${FY_YEAR}-0006` },
      })) ??
      (await prisma.disbursementVoucher.create({
        data: {
          organizationId: org.id,
          dvNumber: `DV-${FY_YEAR}-0006`,
          dvDate: jun(20),
          orsId: ors.id,
          purchaseRequestId: pr.id,
          purchaseOrderId: po.id,
          supplierId: supplier.id,
          fundSourceId: generalFund?.id ?? null,
          responsibilityCenterId: rc.id,
          accountCode: CHEM_EXPENSE_UACS,
          particulars:
            'Payment for delivery of water treatment chemicals (chlorine and aluminum sulfate) ' +
            `per PO-${FY_YEAR}-0006, inspected and accepted.`,
          paymentMode: 'check',
          grossAmount: dvGross,
          taxAmount: dvTax,
          otherDeductions: 0,
          netAmount: dvNet,
          checkNumber: 'DBP-0004821',
          checkDate: jun(21),
          bankName: 'Development Bank of the Philippines — Sta. Barbara Branch',
          certifiedBy: accountantUser.id,
          certifiedAt: jun(19),
          approvedBy: approverUser.id,
          approvedAt: jun(20),
          releasedBy: approverUser.id,
          releasedAt: jun(21),
          status: 'released',
          createdBy: accountantUser.id,
          updatedBy: approverUser.id,
        },
      }));

    // Posted accounting entry for the released DV — this is what Box B of the
    // DV printout renders (sourceType='disbursement', sourceId=dv.id). Balanced:
    // Dr Accounts Payable, Cr Due to BIR (EWT), Cr Cash in Bank (net).
    const existingDvJev = await prisma.journalEntryVoucher.findFirst({
      where: { organizationId: org.id, sourceType: 'disbursement', sourceId: dv.id },
    });
    if (!existingDvJev) {
      const jevDate = jun(21);
      await runAudited(accountantUser.id, (tx) =>
        tx.journalEntryVoucher.create({
          data: {
            organizationId: org.id,
            jevNumber: nextJevNumber(),
            jevDate,
            accountingPeriodId: periodByMonth[6]!,
            sourceType: 'disbursement',
            sourceTable: 'disbursement_vouchers',
            sourceId: dv.id,
            particulars: `DV ${dv.dvNumber}: Payment to ${supplier.name} for water treatment chemicals`,
            responsibilityCenterId: rc.id,
            fundSourceId: generalFund?.id ?? null,
            totalDebit: dvGross,
            totalCredit: dvGross,
            status: 'posted',
            createdBy: accountantUser.id,
            updatedBy: approverUser.id,
            reviewedBy: approverUser.id,
            reviewedAt: jevDate,
            postedBy: approverUser.id,
            postedAt: jevDate,
            lines: {
              create: [
                {
                  chartOfAccountId: acct('20101'),
                  debitAmount: dvGross,
                  creditAmount: 0,
                  description: 'Accounts Payable settled — AquaChem Supplies Trading',
                },
                {
                  chartOfAccountId: acct('2-02-01-010-02'), // Due to BIR - Expanded Withholding Tax
                  debitAmount: 0,
                  creditAmount: dvTax,
                  description: 'Expanded withholding tax on purchases (1% EWT)',
                },
                {
                  chartOfAccountId: acct('10102'),
                  debitAmount: 0,
                  creditAmount: dvNet,
                  description: 'Cash in bank — DBP check DBP-0004821',
                },
              ],
            },
          },
        }),
      );
    }

    console.log(
      `  Sample DV:     ${dv.dvNumber} (released) with posted accounting entry — Procurement module`,
    );

    // Two NON-procurement DVs prepared directly in Accounting, so the register
    // shows a realistic mix (procurement + travel + payroll). Each posts a
    // balanced JEV — its Box B accounting entry.
    type AcctDv = {
      dvNumber: string;
      dvType: string;
      date: Date;
      payeeName: string;
      payeeTin: string | null;
      payeeAddress: string | null;
      particulars: string;
      gross: number;
      check: string;
      lines: Array<{ code: string; debit?: number; credit?: number; desc?: string }>;
    };
    const acctDvs: AcctDv[] = [
      {
        dvNumber: `DV-${FY_YEAR}-0007`,
        dvType: 'travel',
        date: jun(25),
        payeeName: 'Engr. Maria L. Fuentes',
        payeeTin: '182-334-556-000',
        payeeAddress: 'Brgy. Cabugao Sur, Sta. Barbara, Iloilo',
        particulars:
          'Reimbursement of travel expenses — attendance to the PAWD Regional Convention, Iloilo City (June 10–12, 2026).',
        gross: 12500,
        check: 'DBP-0004833',
        lines: [
          {
            code: '5-02-01-010',
            debit: 12500,
            desc: 'Traveling expenses (local) — PAWD convention',
          },
          { code: '1-01-02-020-02', credit: 12500, desc: 'Cash in bank — DBP check DBP-0004833' },
        ],
      },
      {
        dvNumber: `DV-${FY_YEAR}-0008`,
        dvType: 'payroll',
        date: jun(30),
        payeeName: 'SBWD Personnel — Net Payroll (June 16–30, 2026)',
        payeeTin: null,
        payeeAddress: null,
        particulars:
          'Payment of net salaries and wages of regular personnel for the period June 16–30, 2026.',
        gross: 285000,
        check: 'DBP-0004840',
        lines: [
          {
            code: '5-01-01-010',
            debit: 285000,
            desc: 'Net salaries and wages of regular personnel, June 16–30, 2026',
          },
          { code: '1-01-02-020-02', credit: 285000, desc: 'Cash in bank — DBP check DBP-0004840' },
        ],
      },
    ];

    for (const a of acctDvs) {
      const net = round2(a.gross);
      const dvRow =
        (await prisma.disbursementVoucher.findFirst({
          where: { organizationId: org.id, dvNumber: a.dvNumber },
        })) ??
        (await prisma.disbursementVoucher.create({
          data: {
            organizationId: org.id,
            dvNumber: a.dvNumber,
            dvDate: a.date,
            dvType: a.dvType as never,
            payeeName: a.payeeName,
            ...(a.payeeTin ? { payeeTin: a.payeeTin } : {}),
            ...(a.payeeAddress ? { payeeAddress: a.payeeAddress } : {}),
            fundSourceId: generalFund?.id ?? null,
            responsibilityCenterId: rc.id,
            particulars: a.particulars,
            paymentMode: 'check',
            grossAmount: a.gross,
            taxAmount: 0,
            otherDeductions: 0,
            netAmount: net,
            checkNumber: a.check,
            checkDate: a.date,
            bankName: 'Development Bank of the Philippines — Sta. Barbara Branch',
            certifiedBy: accountantUser.id,
            certifiedAt: a.date,
            approvedBy: approverUser.id,
            approvedAt: a.date,
            releasedBy: approverUser.id,
            releasedAt: a.date,
            status: 'released',
            createdBy: accountantUser.id,
            updatedBy: approverUser.id,
          },
        }));

      const existingJev = await prisma.journalEntryVoucher.findFirst({
        where: { organizationId: org.id, sourceType: 'disbursement', sourceId: dvRow.id },
      });
      if (!existingJev) {
        await runAudited(accountantUser.id, (tx) =>
          tx.journalEntryVoucher.create({
            data: {
              organizationId: org.id,
              jevNumber: nextJevNumber(),
              jevDate: a.date,
              accountingPeriodId: periodByMonth[6]!,
              sourceType: 'disbursement',
              sourceTable: 'disbursement_vouchers',
              sourceId: dvRow.id,
              particulars: `DV ${a.dvNumber}: ${a.payeeName}`,
              responsibilityCenterId: rc.id,
              fundSourceId: generalFund?.id ?? null,
              totalDebit: a.gross,
              totalCredit: a.gross,
              status: 'posted',
              createdBy: accountantUser.id,
              updatedBy: approverUser.id,
              reviewedBy: approverUser.id,
              reviewedAt: a.date,
              postedBy: approverUser.id,
              postedAt: a.date,
              lines: {
                create: a.lines.map((l) => ({
                  chartOfAccountId: acct(l.code),
                  debitAmount: round2(l.debit ?? 0),
                  creditAmount: round2(l.credit ?? 0),
                  ...(l.desc ? { description: l.desc } : {}),
                })),
              },
            },
          }),
        );
      }
    }

    // Continue the DV sequence after the seeded set (DV-YYYY-0009 next).
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM document_sequences
      WHERE organization_id = ${org.id}::uuid AND document_type = 'DISBURSEMENT_VOUCHER'
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${org.id}::uuid, 'DISBURSEMENT_VOUCHER', 'DV-', 8)
    `);

    console.log(
      `  Sample DVs:    +DV-${FY_YEAR}-0007 (travel), +DV-${FY_YEAR}-0008 (payroll) — Accounting module`,
    );

    // 12c. Check register — checks are raised BY the DVs (never created manually).
    // Two are already issued (released, numbered); the travel DV is PENDING and
    // awaits the cashier to assign a number and print.
    const dbpOperating = await prisma.bankAccount.findFirst({
      where: { organizationId: org.id, accountNumber: '0712-0397-8N030' },
      select: { id: true },
    });
    if (dbpOperating) {
      const checkSeeds: Array<{
        dvNumber: string;
        number: string | null;
        date: Date;
        status: 'released' | 'pending';
        payee: string;
      }> = [
        {
          dvNumber: `DV-${FY_YEAR}-0006`,
          number: 'DBP-0004821',
          date: jun(21),
          status: 'released',
          payee: 'AquaChem Supplies Trading',
        },
        {
          dvNumber: `DV-${FY_YEAR}-0008`,
          number: 'DBP-0004840',
          date: jun(30),
          status: 'released',
          payee: 'SBWD Personnel — Net Payroll (June 16–30, 2026)',
        },
        {
          dvNumber: `DV-${FY_YEAR}-0007`,
          number: null,
          date: jun(25),
          status: 'pending',
          payee: 'Engr. Maria L. Fuentes',
        },
      ];
      for (const cs of checkSeeds) {
        const dvr = await prisma.disbursementVoucher.findFirst({
          where: { organizationId: org.id, dvNumber: cs.dvNumber },
          select: { id: true, netAmount: true },
        });
        if (!dvr) continue;
        // Keep the DV's check number in step with the seeded check state.
        await prisma.disbursementVoucher.update({
          where: { id: dvr.id },
          data: { checkNumber: cs.number, checkDate: cs.status === 'pending' ? null : cs.date },
        });
        // Reset any existing check for this DV so the seed is deterministic
        // (the travel check must return to 'pending' on every re-seed).
        const existing = await prisma.check.findMany({
          where: { organizationId: org.id, disbursementVoucherId: dvr.id },
          select: { id: true },
        });
        for (const ex of existing) {
          await prisma.checkStatusHistory.deleteMany({ where: { checkId: ex.id } });
          await prisma.check.delete({ where: { id: ex.id } });
        }
        const check = await prisma.check.create({
          data: {
            organizationId: org.id,
            disbursementVoucherId: dvr.id,
            bankAccountId: dbpOperating.id,
            checkNumber: cs.number,
            amount: dvr.netAmount,
            checkDate: cs.date,
            payeeName: cs.payee,
            status: cs.status,
            ...(cs.status === 'released'
              ? { releasedBy: approverUser.id, releasedAt: cs.date }
              : {}),
            createdBy: accountantUser.id,
            updatedBy: cashierUser.id,
          },
        });
        await prisma.checkStatusHistory.create({
          data: {
            checkId: check.id,
            toStatus: cs.status,
            changedBy: cashierUser.id,
            remarks:
              cs.status === 'pending'
                ? `Pending check raised from ${cs.dvNumber}`
                : `Check ${cs.number} issued`,
          },
        });
      }
      console.log('  Sample checks: 2 issued + 1 pending (DV-2026-0007 awaits the cashier)');
    }
  }

  // 12d. Sample bank reconciliations (approved) so the reconciliation history is
  // not empty — the DBP operating account reconciled for the first months.
  {
    const dbpForRecon = await prisma.bankAccount.findFirst({
      where: { organizationId: org.id, accountNumber: '0712-0397-8N030' },
      select: { id: true },
    });
    if (dbpForRecon) {
      const reconMonths = [
        { m: 1, name: 'January', book: 4200000 },
        { m: 2, name: 'February', book: 4380000 },
        { m: 3, name: 'March', book: 4510000 },
      ];
      let made = 0;
      for (const r of reconMonths) {
        const periodId = periodByMonth[r.m];
        if (!periodId) continue;
        const existing = await prisma.bankReconciliation.findFirst({
          where: {
            organizationId: org.id,
            bankAccountId: dbpForRecon.id,
            accountingPeriodId: periodId,
          },
          select: { id: true },
        });
        if (existing) continue;
        const date = new Date(Date.UTC(FY_YEAR, r.m - 1, 28));
        await prisma.bankReconciliation.create({
          data: {
            organizationId: org.id,
            bankAccountId: dbpForRecon.id,
            accountingPeriodId: periodId,
            reconciliationDate: date,
            bookBalance: r.book,
            bankBalance: r.book,
            adjustedBookBalance: r.book,
            adjustedBankBalance: r.book,
            difference: 0,
            status: 'approved',
            preparedBy: accountantUser.id,
            approvedBy: approverUser.id,
            approvedAt: date,
            createdBy: accountantUser.id,
            updatedBy: approverUser.id,
          },
        });
        made++;
      }
      if (made)
        console.log(`  Sample reconciliations: ${made} approved (Jan–Mar) — DBP operating account`);
    }
  }

  // 13. Keep the runtime JEV numbering continuing after the seeded set --------
  // Reset via DELETE + INSERT: an ON CONFLICT upsert silently no-ops here because
  // the unique index includes fiscal_year_id, which is NULL for this sequence
  // (NULLs compare distinct), so the reset would never take effect.
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM document_sequences
    WHERE organization_id = ${org.id}::uuid AND document_type = 'jev'
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO document_sequences (organization_id, document_type, prefix, next_number, padding)
    VALUES (${org.id}::uuid, 'jev', 'JEV-', ${BigInt(seq + 1)}, 6)
  `);

  const jevCount = await prisma.journalEntryVoucher.count({ where: { organizationId: org.id } });
  const lineCount = await prisma.jevLine.count({ where: { jev: { organizationId: org.id } } });

  console.log('Demo seed complete:');
  console.log(`  Organization:  ${ORG_NAME} (${ORG_CODE})`);
  console.log(`  Chart of accounts: ${COA.length} accounts`);
  console.log(`  Fiscal year:   FY${FY_YEAR} with 12 monthly periods (all open)`);
  console.log(`  Posted JEVs:   ${jevCount} (${lineCount} lines) across Jan–Jun ${FY_YEAR}`);
  console.log('  Logins (password "ChangeMe!2026"):');
  console.log('    sbwd.admin       — System Administrator / General Manager');
  console.log('    sbwd.accountant  — Accountant (prepares JEVs & DVs)');
  console.log('    sbwd.approver    — Accountant (reviews & posts JEVs — separation of duties)');
  console.log('    sbwd.cashier     — Cashier (disburses: assigns check #, prints, releases)');
  console.log('    sbwd.gm          — General Manager (dedicated check-void approver)');
  console.log('  Multi-device workflow logins (password "demo1234"):');
  console.log('    preparer         — create + submit only  (403 on approve/post)');
  console.log('    reviewer         — approve only          (403 on create/post)');
  console.log('    poster           — approve+post & reverse (cannot post own entry)');
  console.log('\n  DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
