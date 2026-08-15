import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

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

@Injectable()
export class GlService {
  constructor(private readonly prisma: PrismaService) {}

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
}
