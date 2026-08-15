import { Injectable, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service';

import type { FinancialStatementsService } from './financial-statements.service';

export interface AccountingDashboardResult {
  fiscalYear: { id: string; year: number; name: string };
  asOf: string;
  // Balance-sheet snapshot (from posted + reversed GL)
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  cash: string;
  cashAccountId: string | null;
  receivables: string;
  receivablesAccountId: string | null;
  // Performance (year-to-date)
  revenueYtd: string;
  expensesYtd: string;
  netSurplus: string;
  // JEV workflow
  counts: {
    draft: number;
    forReview: number;
    approved: number;
    posted: number;
    reversed: number;
    voided: number;
  };
}

/**
 * Read-only KPIs for the Accounting Dashboard. Every figure is computed from
 * POSTED (and reversed) journal-entry lines in the database via the same
 * FinancialStatementsService the statements use — there are no hard-coded or
 * cached totals here. Each figure maps to a drill-down target on the client.
 */
@Injectable()
export class AccountingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fs: FinancialStatementsService,
  ) {}

  async getDashboard(
    organizationId: string,
    fiscalYearId?: string,
  ): Promise<AccountingDashboardResult> {
    const fiscalYear = fiscalYearId
      ? await this.prisma.fiscalYear.findFirst({
          where: { id: fiscalYearId, organizationId },
          select: { id: true, year: true, name: true },
        })
      : await this.prisma.fiscalYear.findFirst({
          where: { organizationId },
          orderBy: { year: 'desc' },
          select: { id: true, year: true, name: true },
        });

    if (!fiscalYear) {
      throw new NotFoundException('No fiscal year found for this organization.');
    }

    const statements = await this.fs.getFinancialStatements(organizationId, {
      fiscalYearId: fiscalYear.id,
    });

    const postable = statements.rows.filter((r) => !r.isHeader);

    // Bucket cash and receivables by account nature (name match against the
    // seeded/standard chart). Falls back to 0 if a chart uses other wording.
    const pickBucket = (match: RegExp) => {
      const rows = postable.filter(
        (r) =>
          r.accountType === 'asset' && match.test(r.accountName) && parseFloat(r.balance) !== 0,
      );
      const total = rows.reduce((s, r) => s + parseFloat(r.balance), 0);
      const primary = rows
        .slice()
        .sort((a, b) => Math.abs(parseFloat(b.balance)) - Math.abs(parseFloat(a.balance)))[0];
      return { total: total.toFixed(2), accountId: primary?.accountId ?? null };
    };

    const cash = pickBucket(/cash/i);
    const receivables = pickBucket(/receivable/i);

    const grouped = await this.prisma.journalEntryVoucher.groupBy({
      by: ['status'],
      where: { organizationId, accountingPeriod: { fiscalYearId: fiscalYear.id } },
      _count: { _all: true },
    });
    const countFor = (status: string) => grouped.find((g) => g.status === status)?._count._all ?? 0;

    return {
      fiscalYear,
      asOf: new Date().toISOString().slice(0, 10),
      totalAssets: statements.totalAssets,
      totalLiabilities: statements.totalLiabilities,
      totalEquity: statements.totalEquity,
      cash: cash.total,
      cashAccountId: cash.accountId,
      receivables: receivables.total,
      receivablesAccountId: receivables.accountId,
      revenueYtd: statements.totalRevenue,
      expensesYtd: statements.totalExpenses,
      netSurplus: statements.netIncome,
      counts: {
        draft: countFor('draft'),
        forReview: countFor('for_review'),
        approved: countFor('approved'),
        posted: countFor('posted'),
        reversed: countFor('reversed'),
        voided: countFor('voided'),
      },
    };
  }
}
