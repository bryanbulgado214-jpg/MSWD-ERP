import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

interface AgingBracket {
  key: string;
  label: string;
  total: number;
  count: number;
}

@Injectable()
export class AccountingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accounts-payable aging. Outstanding payables are the Disbursement Vouchers
   * not yet settled by a released/cleared check, aged by DV date.
   */
  async apAging(organizationId: string) {
    const dvs = await this.prisma.disbursementVoucher.findMany({
      where: { organizationId },
      select: {
        dvNumber: true,
        dvDate: true,
        payeeName: true,
        netAmount: true,
        status: true,
        supplier: { select: { name: true } },
        checks: { select: { status: true } },
      },
      orderBy: { dvDate: 'asc' },
    });

    const today = new Date();
    const brackets: (AgingBracket & { min: number; max: number })[] = [
      { key: 'current', label: '0–30 days', min: 0, max: 30, total: 0, count: 0 },
      { key: 'd31_60', label: '31–60 days', min: 31, max: 60, total: 0, count: 0 },
      { key: 'd61_90', label: '61–90 days', min: 61, max: 90, total: 0, count: 0 },
      {
        key: 'over90',
        label: 'Over 90 days',
        min: 91,
        max: Number.POSITIVE_INFINITY,
        total: 0,
        count: 0,
      },
    ];

    const rows: Array<{
      dvNumber: string;
      dvDate: Date;
      payee: string;
      amount: string;
      ageDays: number;
      bracket: string;
    }> = [];
    let total = 0;

    for (const dv of dvs) {
      const paid = dv.checks.some((c) => c.status === 'released' || c.status === 'cleared');
      if (paid) continue; // settled — no longer an open payable
      const ageDays = Math.max(
        0,
        Math.floor((today.getTime() - new Date(dv.dvDate).getTime()) / 86_400_000),
      );
      const amount = Number(dv.netAmount);
      const bucket = brackets.find((b) => ageDays >= b.min && ageDays <= b.max)!;
      bucket.total += amount;
      bucket.count += 1;
      total += amount;
      rows.push({
        dvNumber: dv.dvNumber,
        dvDate: dv.dvDate,
        payee: dv.supplier?.name ?? dv.payeeName ?? '—',
        amount: dv.netAmount.toString(),
        ageDays,
        bracket: bucket.key,
      });
    }

    return {
      asOf: today.toISOString().slice(0, 10),
      total,
      brackets: brackets.map(({ min: _min, max: _max, ...b }) => b),
      rows,
    };
  }

  /**
   * Cash / Bank Activity — per cash & cash-equivalents account (COA 1-01…),
   * the opening balance, receipts (debits) and disbursements (credits) for the
   * selected month, and the closing balance. Computed from posted GL.
   */
  async cashActivity(
    organizationId: string,
    filters: { fiscalYearId?: string; periodId?: string },
  ) {
    const fiscalYear = filters.fiscalYearId
      ? await this.prisma.fiscalYear.findFirst({
          where: { id: filters.fiscalYearId, organizationId },
          select: { id: true, name: true, year: true },
        })
      : await this.prisma.fiscalYear.findFirst({
          where: { organizationId },
          orderBy: { year: 'desc' },
          select: { id: true, name: true, year: true },
        });
    if (!fiscalYear) throw new Error('No fiscal year found for this organization.');

    const periods = await this.prisma.accountingPeriod.findMany({
      where: { fiscalYearId: fiscalYear.id },
      orderBy: { periodNumber: 'asc' },
      select: { id: true, name: true, periodNumber: true },
    });
    if (periods.length === 0) throw new Error('No accounting periods found for this fiscal year.');

    let period = filters.periodId ? periods.find((p) => p.id === filters.periodId) : undefined;
    if (!period) {
      const rows = await this.prisma.$queryRawUnsafe<{ periodNumber: number }[]>(
        `SELECT MAX(ap.period_number) AS "periodNumber"
           FROM accounting_periods ap
           JOIN journal_entry_vouchers j ON j.accounting_period_id = ap.id
          WHERE ap.fiscal_year_id = $2::uuid AND j.organization_id = $1::uuid
            AND j.status IN ('posted','reversed')`,
        organizationId,
        fiscalYear.id,
      );
      const n = rows[0]?.periodNumber ?? periods[periods.length - 1]!.periodNumber;
      period = periods.find((p) => p.periodNumber === n) ?? periods[periods.length - 1];
    }
    const selected = period!;

    const rows = await this.prisma.$queryRawUnsafe<
      { code: string; name: string; opening: string; receipts: string; disbursements: string }[]
    >(
      `SELECT c.account_code AS code, c.name,
              COALESCE(SUM(CASE WHEN ap.period_number <  $3 THEN l.debit_amount - l.credit_amount ELSE 0 END),0)::text AS opening,
              COALESCE(SUM(CASE WHEN ap.period_number =  $3 THEN l.debit_amount  ELSE 0 END),0)::text AS receipts,
              COALESCE(SUM(CASE WHEN ap.period_number =  $3 THEN l.credit_amount ELSE 0 END),0)::text AS disbursements
         FROM chart_of_accounts c
         LEFT JOIN jev_lines l ON l.chart_of_account_id = c.id
         LEFT JOIN journal_entry_vouchers j
                ON j.id = l.jev_id AND j.organization_id = $1::uuid AND j.status IN ('posted','reversed')
         LEFT JOIN accounting_periods ap
                ON ap.id = j.accounting_period_id AND ap.fiscal_year_id = $2::uuid
        WHERE c.organization_id = $1::uuid AND c.is_active = true
          AND c.is_header = false AND c.account_code LIKE '1-01%'
        GROUP BY c.account_code, c.name
        ORDER BY c.account_code`,
      organizationId,
      fiscalYear.id,
      selected.periodNumber,
    );

    const accounts = rows
      .map((r) => {
        const opening = Number(r.opening);
        const receipts = Number(r.receipts);
        const disbursements = Number(r.disbursements);
        return {
          code: r.code,
          name: r.name,
          opening,
          receipts,
          disbursements,
          closing: round2(opening + receipts - disbursements),
        };
      })
      .filter(
        (a) =>
          Math.abs(a.opening) > 0.005 ||
          Math.abs(a.receipts) > 0.005 ||
          Math.abs(a.disbursements) > 0.005,
      );

    const sum = (k: 'opening' | 'receipts' | 'disbursements' | 'closing') =>
      round2(accounts.reduce((s, a) => s + a[k], 0));

    return {
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      period: { id: selected.id, name: selected.name, periodNumber: selected.periodNumber },
      accounts,
      totals: {
        opening: sum('opening'),
        receipts: sum('receipts'),
        disbursements: sum('disbursements'),
        closing: sum('closing'),
      },
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
