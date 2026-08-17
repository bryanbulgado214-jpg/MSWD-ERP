import { randomUUID } from 'crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { AutoJevService } from './auto-jev.service';
import { parseCsvRows } from './csv-parse';

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  level: number;
  isHeader: boolean;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface GeneralLedgerRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  periodId: string;
  periodName: string;
  periodNumber: number;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface SubsidiaryLedgerEntry {
  jevLineId: string;
  jevId: string;
  jevNumber: string;
  jevDate: string;
  particulars: string;
  sourceType: string;
  debitAmount: string;
  creditAmount: string;
  periodName: string;
}

export interface OpeningBalancePreviewRow {
  line: number;
  accountCode: string;
  csvName: string;
  matchedName: string | null;
  debit: number;
  credit: number;
  status: 'ok' | 'unmatched' | 'header' | 'inactive' | 'duplicate' | 'invalid';
  message?: string;
}

export interface OpeningBalancePreview {
  rows: OpeningBalancePreviewRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  okCount: number;
  errors: string[];
  canImport: boolean;
  existingOpeningJev: { id: string; jevNumber: string } | null;
}

@Injectable()
export class GlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  async getTrialBalance(
    organizationId: string,
    filters: { periodId?: string; fiscalYearId?: string },
  ): Promise<TrialBalanceRow[]> {
    const periodClause = filters.periodId
      ? `AND j.accounting_period_id = $2::uuid`
      : filters.fiscalYearId
        ? `AND ap.fiscal_year_id = $2::uuid`
        : '';

    const param2 = filters.periodId ?? filters.fiscalYearId;
    const params: unknown[] = param2 ? [organizationId, param2] : [organizationId];

    const rows = await this.prisma.$queryRawUnsafe<TrialBalanceRow[]>(
      `
      SELECT
        c.id             AS "accountId",
        c.account_code   AS "accountCode",
        c.name           AS "accountName",
        c.account_type   AS "accountType",
        c.normal_balance AS "normalBalance",
        c.level,
        c.is_header      AS "isHeader",
        COALESCE(SUM(l.debit_amount), 0)::text  AS "totalDebit",
        COALESCE(SUM(l.credit_amount), 0)::text AS "totalCredit",
        CASE c.normal_balance
          WHEN 'debit'  THEN (COALESCE(SUM(l.debit_amount), 0) - COALESCE(SUM(l.credit_amount), 0))::text
          WHEN 'credit' THEN (COALESCE(SUM(l.credit_amount), 0) - COALESCE(SUM(l.debit_amount), 0))::text
        END AS "balance"
      FROM chart_of_accounts c
      LEFT JOIN jev_lines l ON l.chart_of_account_id = c.id
        AND EXISTS (
          SELECT 1 FROM journal_entry_vouchers j
          JOIN accounting_periods ap ON ap.id = j.accounting_period_id
          WHERE j.id = l.jev_id
            AND j.organization_id = $1::uuid
            AND j.status IN ('posted', 'reversed')
            ${periodClause}
        )
      WHERE c.organization_id = $1::uuid
        AND c.is_active = true
        AND c.is_header = false
      GROUP BY c.id, c.account_code, c.name, c.account_type, c.normal_balance, c.level, c.is_header
      HAVING COALESCE(SUM(l.debit_amount), 0) != 0
         OR COALESCE(SUM(l.credit_amount), 0) != 0
      ORDER BY c.account_code
      `,
      ...params,
    );

    return rows;
  }

  async getGeneralLedger(
    organizationId: string,
    filters: { fiscalYearId?: string; accountType?: string },
  ): Promise<GeneralLedgerRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (filters.fiscalYearId) {
      conditions.push(`ap.fiscal_year_id = $${idx}::uuid`);
      params.push(filters.fiscalYearId);
      idx++;
    }
    if (filters.accountType) {
      conditions.push(`c.account_type = $${idx}`);
      params.push(filters.accountType);
      idx++;
    }

    const extraWhere = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    const rows = await this.prisma.$queryRawUnsafe<GeneralLedgerRow[]>(
      `
      SELECT
        c.id             AS "accountId",
        c.account_code   AS "accountCode",
        c.name           AS "accountName",
        c.account_type   AS "accountType",
        c.normal_balance AS "normalBalance",
        ap.id            AS "periodId",
        ap.name          AS "periodName",
        ap.period_number AS "periodNumber",
        COALESCE(SUM(l.debit_amount), 0)::text  AS "totalDebit",
        COALESCE(SUM(l.credit_amount), 0)::text AS "totalCredit",
        CASE c.normal_balance
          WHEN 'debit'  THEN (COALESCE(SUM(l.debit_amount), 0) - COALESCE(SUM(l.credit_amount), 0))::text
          WHEN 'credit' THEN (COALESCE(SUM(l.credit_amount), 0) - COALESCE(SUM(l.debit_amount), 0))::text
        END AS "balance"
      FROM jev_lines l
      JOIN journal_entry_vouchers j ON j.id = l.jev_id
      JOIN accounting_periods ap ON ap.id = j.accounting_period_id
      JOIN chart_of_accounts c ON c.id = l.chart_of_account_id
      WHERE j.organization_id = $1::uuid
        AND j.status IN ('posted', 'reversed')
        AND c.is_header = false
        ${extraWhere}
      GROUP BY c.id, c.account_code, c.name, c.account_type, c.normal_balance,
               ap.id, ap.name, ap.period_number
      ORDER BY c.account_code, ap.period_number
      `,
      ...params,
    );

    return rows;
  }

  async getSubsidiaryLedger(
    organizationId: string,
    accountId: string,
    filters: { startDate?: string; endDate?: string; periodId?: string },
  ): Promise<{
    account: {
      id: string;
      accountCode: string;
      name: string;
      accountType: string;
      normalBalance: string;
    };
    entries: SubsidiaryLedgerEntry[];
  }> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, organizationId },
      select: { id: true, accountCode: true, name: true, accountType: true, normalBalance: true },
    });
    if (!account) {
      return {
        account: {
          id: accountId,
          accountCode: '',
          name: 'Unknown',
          accountType: '',
          normalBalance: 'debit',
        },
        entries: [],
      };
    }

    const conditions: string[] = [];
    const params: unknown[] = [organizationId, accountId];
    let idx = 3;

    if (filters.periodId) {
      conditions.push(`j.accounting_period_id = $${idx}::uuid`);
      params.push(filters.periodId);
      idx++;
    }
    if (filters.startDate) {
      conditions.push(`j.jev_date >= $${idx}::date`);
      params.push(filters.startDate);
      idx++;
    }
    if (filters.endDate) {
      conditions.push(`j.jev_date <= $${idx}::date`);
      params.push(filters.endDate);
      idx++;
    }

    const extraWhere = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    const entries = await this.prisma.$queryRawUnsafe<SubsidiaryLedgerEntry[]>(
      `
      SELECT
        l.id             AS "jevLineId",
        j.id             AS "jevId",
        j.jev_number     AS "jevNumber",
        j.jev_date::text AS "jevDate",
        j.particulars,
        j.source_type    AS "sourceType",
        l.debit_amount::text  AS "debitAmount",
        l.credit_amount::text AS "creditAmount",
        ap.name          AS "periodName"
      FROM jev_lines l
      JOIN journal_entry_vouchers j ON j.id = l.jev_id
      JOIN accounting_periods ap ON ap.id = j.accounting_period_id
      WHERE j.organization_id = $1::uuid
        AND j.status IN ('posted', 'reversed')
        AND l.chart_of_account_id = $2::uuid
        ${extraWhere}
      ORDER BY j.jev_date, j.jev_number
      `,
      ...params,
    );

    return { account, entries };
  }

  async getFiscalYears(organizationId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { organizationId },
      select: { id: true, year: true, name: true, status: true },
      orderBy: { year: 'desc' },
    });
  }

  async getPeriodsByFiscalYear(organizationId: string, fiscalYearId: string) {
    return this.prisma.accountingPeriod.findMany({
      where: {
        fiscalYearId,
        fiscalYear: { organizationId },
      },
      select: {
        id: true,
        name: true,
        periodNumber: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: { periodNumber: 'asc' },
    });
  }

  async getPostableAccounts(organizationId: string) {
    return this.prisma.chartOfAccount.findMany({
      where: {
        organizationId,
        isActive: true,
        isHeader: false,
      },
      select: { id: true, accountCode: true, name: true, accountType: true, normalBalance: true },
      orderBy: { accountCode: 'asc' },
    });
  }

  // ── Beginning balances (Trial Balance CSV upload) ───────────────────────────

  /**
   * Validate a beginning-balances CSV against the chart of accounts. Expected
   * columns (header row required): Account Code, Account Name (optional), Debit,
   * Credit. Returns a per-row breakdown plus blocking errors; `canImport` is true
   * only when every code matches a postable account and debits equal credits.
   */
  async previewOpeningBalances(
    organizationId: string,
    csv: string,
  ): Promise<OpeningBalancePreview> {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { organizationId },
      select: { id: true, accountCode: true, name: true, isHeader: true, isActive: true },
    });
    const byCode = new Map(accounts.map((a) => [a.accountCode.trim().toLowerCase(), a]));

    const existing = await this.prisma.journalEntryVoucher.findFirst({
      where: { organizationId, sourceTable: 'opening_balance' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, jevNumber: true },
    });

    const grid = parseCsvRows(csv).filter((r) => r.some((c) => c.trim() !== ''));
    const errors: string[] = [];
    const rows: OpeningBalancePreviewRow[] = [];

    if (grid.length < 2) {
      return {
        rows: [],
        totalDebit: 0,
        totalCredit: 0,
        balanced: false,
        okCount: 0,
        errors: [
          'The file is empty or has only a header row. Add one row per account with a balance.',
        ],
        canImport: false,
        existingOpeningJev: existing,
      };
    }

    // Locate columns from the header row (order-independent, case-insensitive).
    const header = grid[0]!.map((c) => c.trim().toLowerCase());
    const find = (...names: RegExp[]) => header.findIndex((h) => names.some((re) => re.test(h)));
    const codeIdx = find(/^account\s*code$/, /^code$/, /^account$/, /account\s*code/, /uacs/);
    const debitIdx = find(/^debit$/, /^dr$/, /debit/);
    const creditIdx = find(/^credit$/, /^cr$/, /credit/);
    const nameIdx = find(/^account\s*name$/, /account\s*title/, /^name$/, /^description$/);

    if (codeIdx === -1 || debitIdx === -1 || creditIdx === -1) {
      errors.push(
        'The header row must include the columns: Account Code, Debit, Credit (an Account Name column is optional).',
      );
      return {
        rows: [],
        totalDebit: 0,
        totalCredit: 0,
        balanced: false,
        okCount: 0,
        errors,
        canImport: false,
        existingOpeningJev: existing,
      };
    }

    const parseNum = (raw: string): number | null => {
      const s = (raw ?? '').replace(/[₱,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
      if (s === '') return 0;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const seen = new Set<string>();
    let totalDebit = 0;
    let totalCredit = 0;
    let okCount = 0;
    const unmatched: string[] = [];
    const headerAccts: string[] = [];
    const inactiveAccts: string[] = [];

    for (let i = 1; i < grid.length; i++) {
      const cells = grid[i]!;
      const code = (cells[codeIdx] ?? '').trim();
      const csvName = nameIdx >= 0 ? (cells[nameIdx] ?? '').trim() : '';
      if (code === '') continue; // skip blank lines
      const debit = parseNum(cells[debitIdx] ?? '');
      const credit = parseNum(cells[creditIdx] ?? '');

      const push = (
        status: OpeningBalancePreviewRow['status'],
        message?: string,
        matchedName: string | null = null,
      ) =>
        rows.push({
          line: i + 1,
          accountCode: code,
          csvName,
          matchedName,
          debit: debit ?? 0,
          credit: credit ?? 0,
          status,
          ...(message !== undefined ? { message } : {}),
        });

      if (debit === null || credit === null) {
        push('invalid', 'Debit/Credit is not a valid number.');
        continue;
      }
      const key = code.toLowerCase();
      if (seen.has(key)) {
        push('duplicate', 'This account code appears more than once in the file.');
        continue;
      }
      seen.add(key);

      const acct = byCode.get(key);
      if (!acct) {
        unmatched.push(code);
        push('unmatched', 'No account with this code exists in the chart of accounts.');
        continue;
      }
      if (acct.isHeader) {
        headerAccts.push(code);
        push('header', 'This is a summary/header account and cannot carry a balance.', acct.name);
        continue;
      }
      if (!acct.isActive) {
        inactiveAccts.push(code);
        push('inactive', 'This account is inactive.', acct.name);
        continue;
      }
      if (debit !== 0 && credit !== 0) {
        push('invalid', 'A row may have a Debit or a Credit, not both.', acct.name);
        continue;
      }
      totalDebit += debit;
      totalCredit += credit;
      okCount += 1;
      push('ok', undefined, acct.name);
    }

    if (unmatched.length) {
      errors.push(
        `${unmatched.length} account code(s) do not match the chart of accounts: ${unmatched.slice(0, 15).join(', ')}${unmatched.length > 15 ? ', …' : ''}.`,
      );
    }
    if (headerAccts.length) {
      errors.push(
        `Cannot post a balance to summary/header account(s): ${headerAccts.slice(0, 15).join(', ')}.`,
      );
    }
    if (inactiveAccts.length) {
      errors.push(
        `Inactive account(s) cannot receive a balance: ${inactiveAccts.slice(0, 15).join(', ')}.`,
      );
    }
    if (rows.some((r) => r.status === 'invalid')) {
      errors.push('Some rows have an invalid amount (see the highlighted rows).');
    }
    if (rows.some((r) => r.status === 'duplicate')) {
      errors.push('Some account codes are repeated in the file.');
    }
    if (okCount === 0) {
      errors.push('No account rows with a balance were found.');
    }

    const balanced = okCount > 0 && Math.abs(totalDebit - totalCredit) < 0.005;
    if (okCount > 0 && !balanced) {
      errors.push(
        `The beginning balances do not balance: total debits ${totalDebit.toFixed(2)} vs total credits ${totalCredit.toFixed(2)} (off by ${Math.abs(totalDebit - totalCredit).toFixed(2)}).`,
      );
    }

    const canImport = errors.length === 0 && balanced && okCount > 0;
    return {
      rows,
      totalDebit,
      totalCredit,
      balanced,
      okCount,
      errors,
      canImport,
      existingOpeningJev: existing,
    };
  }

  /**
   * Import beginning balances: re-validates the CSV, then posts a single balanced
   * opening-balance journal voucher dated `asOfDate`. Fails loudly if any code is
   * unmatched, the entry is unbalanced, or no open period covers the date.
   */
  async importOpeningBalances(
    organizationId: string,
    userId: string,
    csv: string,
    asOfDate: string,
  ): Promise<{ jevId: string; jevNumber: string; lineCount: number; totalDebit: number }> {
    const preview = await this.previewOpeningBalances(organizationId, csv);
    if (!preview.canImport) {
      throw new BadRequestException(
        preview.errors[0] ??
          'The file could not be imported. Please fix the highlighted problems and try again.',
      );
    }

    const jevDate = new Date(asOfDate);
    if (Number.isNaN(jevDate.getTime())) {
      throw new BadRequestException(
        'Please choose a valid "as of" date for the beginning balances.',
      );
    }

    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { organizationId },
      select: { id: true, accountCode: true },
    });
    const idByCode = new Map(accounts.map((a) => [a.accountCode.trim().toLowerCase(), a.id]));

    const lines = preview.rows
      .filter((r) => r.status === 'ok')
      .map((r) => ({
        chartOfAccountId: idByCode.get(r.accountCode.toLowerCase())!,
        debitAmount: r.debit,
        creditAmount: r.credit,
        description: 'Beginning balance',
      }));

    const jev = await this.prisma.$transaction(async (tx) => {
      return this.autoJev.createAutoJev(tx, {
        organizationId,
        userId,
        jevDate,
        sourceType: 'manual',
        sourceTable: 'opening_balance',
        sourceId: randomUUID(),
        particulars: `Beginning balances as of ${asOfDate} (CSV upload)`,
        status: 'posted',
        lines,
      });
    });

    if (!jev) {
      throw new BadRequestException(
        `No open accounting period covers ${asOfDate}. Open the period for that date, then import again.`,
      );
    }

    return {
      jevId: jev.id,
      jevNumber: jev.jevNumber,
      lineCount: lines.length,
      totalDebit: preview.totalDebit,
    };
  }
}
