import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

export interface FinancialStatementRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  level: number;
  parentAccountId: string | null;
  isHeader: boolean;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface FinancialStatementResult {
  asOfDate: string;
  periodName: string;
  rows: FinancialStatementRow[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

@Injectable()
export class FinancialStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialStatements(
    organizationId: string,
    filters: { periodId?: string; fiscalYearId?: string },
  ): Promise<FinancialStatementResult> {
    const periodClause = filters.periodId
      ? `AND j.accounting_period_id = $2::uuid`
      : filters.fiscalYearId
        ? `AND ap.fiscal_year_id = $2::uuid`
        : '';

    const param2 = filters.periodId ?? filters.fiscalYearId;
    const params: unknown[] = param2
      ? [organizationId, param2]
      : [organizationId];

    const rows = await this.prisma.$queryRawUnsafe<FinancialStatementRow[]>(
      `
      SELECT
        c.id                AS "accountId",
        c.account_code      AS "accountCode",
        c.name              AS "accountName",
        c.account_type      AS "accountType",
        c.normal_balance    AS "normalBalance",
        c.level,
        c.parent_account_id AS "parentAccountId",
        c.is_header         AS "isHeader",
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
            AND j.status = 'posted'
            ${periodClause}
        )
      WHERE c.organization_id = $1::uuid
        AND c.is_active = true
      GROUP BY c.id, c.account_code, c.name, c.account_type, c.normal_balance,
               c.level, c.parent_account_id, c.is_header
      ORDER BY c.account_code
      `,
      ...params,
    );

    const postableRows = rows.filter((r) => !r.isHeader);

    const sumByType = (type: string) =>
      postableRows
        .filter((r) => r.accountType === type)
        .reduce((sum, r) => sum + parseFloat(r.balance), 0);

    const totalAssets = sumByType('asset');
    const totalLiabilities = sumByType('liability');
    const totalEquity = sumByType('equity');
    const totalRevenue = sumByType('revenue');
    const totalExpenses = sumByType('expense');
    const netIncome = totalRevenue - totalExpenses;

    let periodName = 'All Periods';
    if (filters.periodId) {
      const p = await this.prisma.accountingPeriod.findUnique({
        where: { id: filters.periodId },
        select: { name: true, endDate: true },
      });
      if (p) periodName = p.name;
    } else if (filters.fiscalYearId) {
      const fy = await this.prisma.fiscalYear.findUnique({
        where: { id: filters.fiscalYearId },
        select: { name: true },
      });
      if (fy) periodName = fy.name;
    }

    return {
      asOfDate: new Date().toISOString().slice(0, 10),
      periodName,
      rows,
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquity.toFixed(2),
      totalRevenue: totalRevenue.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netIncome: netIncome.toFixed(2),
    };
  }
}
