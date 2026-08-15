import { Injectable } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service';

/**
 * COA-prescribed detailed financial statements (water-district monthly format):
 *   • SFP — Statement of Financial Position  (as-of month-end vs prior year-end)
 *   • SCI — Statement of Comprehensive Income (Current Month vs Year-to-Date)
 *
 * Both are generated from the organization's own UACS chart-of-accounts
 * hierarchy plus posted GL, so no statement layout is hard-coded. Contra
 * accounts (Accumulated Depreciation, Allowance for Impairment, contra
 * payables) are handled automatically: every account's contribution to its
 * section is measured on the section's normal side — debit-positive for
 * assets & expenses, credit-positive for liabilities, equity & income — so a
 * credit-balance account under Assets nets *down* the total, yielding book /
 * net values without special cases.
 *
 * The Statement of Cash Flows (SCF) is a separate, later addition.
 */

export type StatementKind = 'sfp' | 'sci' | 'scf';

export interface StatementRow {
  code: string | null;
  label: string;
  level: number; // 0 = section, 1..n = hierarchy depth
  kind: 'section' | 'header' | 'account' | 'total' | 'grand_total' | 'spacer';
  current: number; // column 1
  compare: number; // column 2 (prior year for SFP; YTD for SCI)
}

export interface DetailedStatementResult {
  kind: StatementKind;
  title: string;
  organizationName: string;
  headingPeriod: string; // e.g. "AS OF MARCH 31, 2026" / "FOR THE MONTH OF MARCH 2026"
  currentLabel: string;
  compareLabel: string;
  fiscalYear: { id: string; name: string };
  period: { id: string; name: string; periodNumber: number };
  rows: StatementRow[];
  // convenience totals for callers / drill-down
  totals: Record<string, number>;
  preparedBy: string;
  notedBy: string;
}

export interface SceRow {
  label: string;
  level: number;
  kind: 'header' | 'account' | 'total' | 'spacer';
  values: number[]; // aligned to `columns`
}

export interface ChangesInEquityResult {
  title: string;
  organizationName: string;
  headingPeriod: string;
  columns: string[];
  fiscalYear: { id: string; name: string };
  rows: SceRow[];
  preparedBy: string;
  notedBy: string;
}

interface CoaRow {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  level: number;
  isHeader: boolean;
}

interface Sums {
  accountId: string;
  cumDebit: string;
  cumCredit: string;
  monthDebit: string;
  monthCredit: string;
}

interface CashFlowLine {
  jevId: string;
  periodNumber: number;
  code: string;
  type: CoaRow['type'];
  debit: string;
  credit: string;
}

const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

/** Display labels for the direct-method cash-flow line keys. */
const CATEGORY_LABEL: Record<string, string> = {
  // operating inflows
  collect_income: 'Collection of Income / Revenues',
  collect_recv: 'Collection of Receivables',
  trust_recv: 'Trust Receipts',
  other_recv: 'Other Receipts',
  // operating outflows
  pay_ps: 'Payment of Personnel Services',
  pay_mooe: 'Payment of Maintenance & Other Operating Expenses',
  pay_fin: 'Payment of Financial Expenses',
  pay_exp: 'Payment of Expenses',
  purch_inv: 'Purchase of Inventories',
  cash_adv: 'Grant of Cash Advances',
  prepay: 'Prepayments',
  pay_ap: 'Payment of Accounts Payable',
  remit: 'Remittance of Contributions & Mandatory Deductions',
  other_disb: 'Other Disbursements',
  // investing
  sale_ppe: 'Proceeds from Sale / Disposal of Property, Plant & Equipment',
  sale_asset: 'Proceeds from Sale of Other Assets',
  purch_ppe: 'Purchase / Construction of Property, Plant & Equipment',
  purch_intang: 'Purchase of Intangible Assets',
  // financing
  loan_proceeds: 'Proceeds from Loans / Borrowings',
  contrib: 'Receipt of Equity Contributions',
  pay_loans: 'Payment of Long-Term Liabilities',
  redeem: 'Redemption of Bills / Bonds',
  pay_interest: 'Payment of Interest',
};

@Injectable()
export class DetailedStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatement(
    organizationId: string,
    kind: StatementKind,
    filters: {
      fiscalYearId?: string;
      periodId?: string;
      mode?: 'monthly' | 'annual';
      condensed?: boolean;
    },
  ): Promise<DetailedStatementResult> {
    const annual = filters.mode === 'annual';
    const condensed = filters.condensed === true;
    // ── Resolve fiscal year + the reporting period ────────────────────────
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
    if (!fiscalYear) {
      throw new Error('No fiscal year found for this organization.');
    }

    const periods = await this.prisma.accountingPeriod.findMany({
      where: { fiscalYearId: fiscalYear.id },
      orderBy: { periodNumber: 'asc' },
      select: { id: true, name: true, periodNumber: true, endDate: true },
    });
    if (periods.length === 0) {
      throw new Error('No accounting periods found for this fiscal year.');
    }

    // Reporting period: annual → full-year (as-of the last period); else explicit,
    // else the latest period that carries posted activity.
    let period = filters.periodId ? periods.find((p) => p.id === filters.periodId) : undefined;
    if (annual) {
      period = periods[periods.length - 1];
    } else if (!period) {
      const lastWithData = await this.lastPeriodWithActivity(organizationId, fiscalYear.id);
      period = periods.find((p) => p.id === lastWithData) ?? periods[periods.length - 1];
    }
    const selected = period!;

    // ── Gather balances ──────────────────────────────────────────────────
    const accounts = await this.prisma.$queryRawUnsafe<CoaRow[]>(
      `SELECT id, account_code AS code, name, account_type AS type, level, is_header AS "isHeader"
         FROM chart_of_accounts
        WHERE organization_id = $1::uuid AND is_active = true
        ORDER BY account_code`,
      organizationId,
    );

    const sums = await this.windowedSums(
      organizationId,
      fiscalYear.id,
      selected.periodNumber,
      selected.id,
    );
    const priorFy = await this.prisma.fiscalYear.findFirst({
      where: { organizationId, year: fiscalYear.year - 1 },
      select: { id: true },
    });
    const priorSums = priorFy
      ? await this.fullYearSums(organizationId, priorFy.id)
      : new Map<string, { debit: number; credit: number }>();

    // signed contribution on the section's normal side
    const debitPositive = (t: CoaRow['type']) => t === 'asset' || t === 'expense';
    const sumMap = new Map(sums.map((s) => [s.accountId, s]));
    const codeByType = new Map<string, CoaRow['type']>();
    accounts.forEach((a) => codeByType.set(a.code, a.type));

    // Per-postable-account signed amounts for each column, and prefix-accumulated
    // subtotals for every ancestor header code.
    const cur = new Map<string, number>(); // as-of end of selected period  (SFP) / YTD movement (SCI)
    const cmp = new Map<string, number>(); // prior-year-end (SFP)          / current-month movement (SCI)
    const addPrefix = (map: Map<string, number>, code: string, amt: number) => {
      const parts = code.split('-');
      let acc = '';
      for (let i = 0; i < parts.length; i++) {
        acc = acc ? `${acc}-${parts[i]}` : parts[i]!;
        map.set(acc, (map.get(acc) ?? 0) + amt);
      }
    };

    for (const a of accounts) {
      if (a.isHeader) continue;
      const sign = debitPositive(a.type) ? 1 : -1;
      const s = sumMap.get(a.id);
      const cumDr = Number(s?.cumDebit ?? 0);
      const cumCr = Number(s?.cumCredit ?? 0);
      const moDr = Number(s?.monthDebit ?? 0);
      const moCr = Number(s?.monthCredit ?? 0);
      const p = priorSums.get(a.id);

      const prior = sign * ((p?.debit ?? 0) - (p?.credit ?? 0));
      if (annual) {
        // Year-end: column 1 = full current year, column 2 = full prior year
        addPrefix(cur, a.code, sign * (cumDr - cumCr));
        addPrefix(cmp, a.code, prior);
      } else if (kind === 'sfp') {
        // column 1 = as-of end of selected period (cumulative), column 2 = prior year-end
        addPrefix(cur, a.code, sign * (cumDr - cumCr));
        addPrefix(cmp, a.code, prior);
      } else {
        // SCI (interim): column 1 = current-month movement, column 2 = year-to-date
        addPrefix(cur, a.code, sign * (moDr - moCr));
        addPrefix(cmp, a.code, sign * (cumDr - cumCr));
      }
    }

    const rows: StatementRow[] = [];
    const totals: Record<string, number> = {};

    const emitSection = (
      type: CoaRow['type'],
      sectionLabel: string,
      totalLabel: string,
      extra?: { label: string; current: number; compare: number },
    ): { current: number; compare: number } => {
      const rootCode = accounts.find((a) => a.type === type && a.level === 1)?.code ?? type;
      rows.push({
        code: null,
        label: sectionLabel,
        level: 0,
        kind: 'section',
        current: 0,
        compare: 0,
      });
      for (const a of accounts) {
        if (a.type !== type || a.level === 1) continue;
        if (condensed && a.level >= 3) continue; // condensed = category (L2) rollup only
        const c1 = cur.get(a.code) ?? 0;
        const c2 = cmp.get(a.code) ?? 0;
        // Show every header (structure) but hide empty leaf accounts to keep it readable.
        if (!a.isHeader && Math.abs(c1) < 0.005 && Math.abs(c2) < 0.005) continue;
        rows.push({
          code: a.code,
          label: a.name,
          level: a.level - 1,
          kind: a.isHeader ? 'header' : 'account',
          current: round2(c1),
          compare: round2(c2),
        });
      }
      let t1 = round2(cur.get(rootCode) ?? 0);
      let t2 = round2(cmp.get(rootCode) ?? 0);
      if (extra) {
        rows.push({
          code: null,
          label: extra.label,
          level: 1,
          kind: 'account',
          current: round2(extra.current),
          compare: round2(extra.compare),
        });
        t1 = round2(t1 + extra.current);
        t2 = round2(t2 + extra.compare);
      }
      rows.push({
        code: null,
        label: totalLabel,
        level: 0,
        kind: 'total',
        current: t1,
        compare: t2,
      });
      rows.push({ code: null, label: '', level: 0, kind: 'spacer', current: 0, compare: 0 });
      return { current: t1, compare: t2 };
    };

    const monthName = MONTHS[selected.periodNumber - 1] ?? selected.name.toUpperCase();
    const asOfDate = selected.endDate ? new Date(selected.endDate) : new Date();
    const asOfStr = `${monthName} ${asOfDate.getUTCDate()}, ${fiscalYear.year}`;

    if (kind === 'sfp') {
      // Interim surplus/(deficit): year-to-date Income − Expenses, not yet closed
      // to Retained Earnings, must sit inside Equity for A = L + E to hold.
      const revRoot = accounts.find((a) => a.type === 'revenue' && a.level === 1)?.code ?? '4';
      const expRoot = accounts.find((a) => a.type === 'expense' && a.level === 1)?.code ?? '5';
      const surplusCur = round2((cur.get(revRoot) ?? 0) - (cur.get(expRoot) ?? 0));
      const surplusCmp = round2((cmp.get(revRoot) ?? 0) - (cmp.get(expRoot) ?? 0));

      const assets = emitSection('asset', 'ASSETS', 'TOTAL ASSETS');
      const liab = emitSection('liability', 'LIABILITIES', 'TOTAL LIABILITIES');
      const equity = emitSection('equity', 'EQUITY', 'TOTAL EQUITY', {
        label: 'Retained Earnings / (Deficit) — Current Period Surplus',
        current: surplusCur,
        compare: surplusCmp,
      });
      rows.push({
        code: null,
        label: 'TOTAL LIABILITIES AND EQUITY',
        level: 0,
        kind: 'grand_total',
        current: round2(liab.current + equity.current),
        compare: round2(liab.compare + equity.compare),
      });
      totals.totalAssets = assets.current;
      totals.totalLiabilities = liab.current;
      totals.totalEquity = equity.current;
      totals.totalLiabilitiesAndEquity = round2(liab.current + equity.current);

      return {
        kind,
        title: `${condensed ? 'CONDENSED' : 'DETAILED'} STATEMENT OF FINANCIAL POSITION`,
        organizationName: await this.orgName(organizationId),
        headingPeriod: annual ? `AS AT DECEMBER 31, ${fiscalYear.year}` : `AS OF ${asOfStr}`,
        currentLabel: annual
          ? `${fiscalYear.year}`
          : `As of ${titleCase(monthName)} ${fiscalYear.year}`,
        compareLabel: annual
          ? `${fiscalYear.year - 1}`
          : priorFy
            ? `As of Dec 31, ${fiscalYear.year - 1}`
            : `Prior Year`,
        fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
        period: { id: selected.id, name: selected.name, periodNumber: selected.periodNumber },
        rows,
        totals,
        preparedBy: 'Accountant',
        notedBy: 'General Manager',
      };
    }

    // ── SCI ────────────────────────────────────────────────────────────────
    const income = emitSection('revenue', 'INCOME', 'TOTAL INCOME');
    const expenses = emitSection('expense', 'EXPENSES', 'TOTAL EXPENSES');
    rows.push({
      code: null,
      label: 'NET INCOME / (LOSS)',
      level: 0,
      kind: 'grand_total',
      current: round2(income.current - expenses.current),
      compare: round2(income.compare - expenses.compare),
    });
    totals.totalIncome = income.current;
    totals.totalExpenses = expenses.current;
    totals.netIncomeCurrentMonth = round2(income.current - expenses.current);
    totals.netIncomeYtd = round2(income.compare - expenses.compare);

    return {
      kind,
      title: `${condensed ? 'CONDENSED' : 'DETAILED'} STATEMENT OF COMPREHENSIVE INCOME`,
      organizationName: await this.orgName(organizationId),
      headingPeriod: annual
        ? `FOR THE YEAR ENDED DECEMBER 31, ${fiscalYear.year}`
        : `FOR THE MONTH OF ${titleCase(monthName)} ${fiscalYear.year}`,
      currentLabel: annual ? `${fiscalYear.year}` : 'Current Month',
      compareLabel: annual ? `${fiscalYear.year - 1}` : 'Year to Date',
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      period: { id: selected.id, name: selected.name, periodNumber: selected.periodNumber },
      rows,
      totals,
      preparedBy: 'Accountant',
      notedBy: 'General Manager',
    };
  }

  /**
   * Direct-method Statement of Cash Flows. Every posted movement through a cash
   * account (code 1-01…) is attributed to the non-cash lines on the opposite
   * side of the same voucher, in proportion to their amounts, and classified by
   * the contra account into an Operating / Investing / Financing line. Movements
   * whose contra is Equity (opening balances / capital) or another cash account
   * (internal transfers) are excluded — the former is folded into "Cash,
   * Beginning". Beginning = Ending − Net Cash Flow, so the statement ties to the
   * GL cash balance by construction.
   */
  async getCashFlows(
    organizationId: string,
    filters: {
      fiscalYearId?: string;
      periodId?: string;
      mode?: 'monthly' | 'annual';
      condensed?: boolean;
    },
  ): Promise<DetailedStatementResult> {
    const annual = filters.mode === 'annual';
    const condensed = filters.condensed === true;
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
      select: { id: true, name: true, periodNumber: true, endDate: true },
    });
    if (periods.length === 0) throw new Error('No accounting periods found for this fiscal year.');

    let period = filters.periodId ? periods.find((p) => p.id === filters.periodId) : undefined;
    if (annual) {
      period = periods[periods.length - 1];
    } else if (!period) {
      const last = await this.lastPeriodWithActivity(organizationId, fiscalYear.id);
      period = periods.find((p) => p.id === last) ?? periods[periods.length - 1];
    }
    const selected = period!;

    const priorFy = annual
      ? await this.prisma.fiscalYear.findFirst({
          where: { organizationId, year: fiscalYear.year - 1 },
          select: { id: true },
        })
      : null;

    // Posted lines for this FY up to the selected period (all periods when annual).
    const lines = await this.cashFlowLines(organizationId, fiscalYear.id, selected.periodNumber);

    const isCash = (code: string) => code.startsWith('1-01');

    // Column maps (positive magnitudes): cur = column 1, ytd = column 2.
    const cur = new Map<string, number>();
    const ytd = new Map<string, number>();
    const bump = (map: Map<string, number>, key: string | null, amount: number) => {
      if (!key || amount <= 0) return;
      map.set(key, (map.get(key) ?? 0) + amount);
    };

    const groupByJev = (ls: CashFlowLine[]) => {
      const m = new Map<string, CashFlowLine[]>();
      for (const l of ls) {
        const a = m.get(l.jevId) ?? [];
        a.push(l);
        m.set(l.jevId, a);
      }
      return m;
    };

    // Classify a voucher's cash movements via `route`; returns its net cash delta.
    const classifyJev = (
      jl: CashFlowLine[],
      route: (key: string | null, amt: number) => void,
    ): number => {
      const cashLines = jl.filter((l) => isCash(l.code));
      const nonCash = jl.filter((l) => !isCash(l.code));
      let delta = 0;
      for (const cl of cashLines) delta += Number(cl.debit) - Number(cl.credit);
      const cashIn = cashLines.reduce((s, l) => s + Number(l.debit), 0);
      const cashOut = cashLines.reduce((s, l) => s + Number(l.credit), 0);
      if (cashIn > 0) {
        const credits = nonCash.filter((l) => Number(l.credit) > 0);
        const total = credits.reduce((s, l) => s + Number(l.credit), 0);
        if (total > 0)
          for (const l of credits)
            route(this.classifyFlow(l.type, l.code, 'in'), (cashIn * Number(l.credit)) / total);
      }
      if (cashOut > 0) {
        const debits = nonCash.filter((l) => Number(l.debit) > 0);
        const total = debits.reduce((s, l) => s + Number(l.debit), 0);
        if (total > 0)
          for (const l of debits)
            route(this.classifyFlow(l.type, l.code, 'out'), (cashOut * Number(l.debit)) / total);
      }
      return delta;
    };

    let endingCash = 0; // column-1 (current) ending cash
    let endingCashCmp = 0; // column-2 (compare) ending cash

    for (const [, jl] of groupByJev(lines)) {
      const inThisMonth = jl.some((l) => l.periodNumber === selected.periodNumber);
      endingCash += classifyJev(jl, (key, amt) => {
        if (annual) {
          bump(cur, key, amt); // whole current FY → column 1
        } else {
          bump(ytd, key, amt); // cumulative (YTD) → column 2
          if (inThisMonth) bump(cur, key, amt); // current month → column 1
        }
      });
    }

    // Year-end comparative: run the prior fiscal year into column 2.
    if (annual && priorFy) {
      const priorLines = await this.cashFlowLines(organizationId, priorFy.id, 13);
      for (const [, jl] of groupByJev(priorLines)) {
        endingCashCmp += classifyJev(jl, (key, amt) => bump(ytd, key, amt));
      }
    }

    // ── Assemble rows in the prescribed activity order ──────────────────────
    const rows: StatementRow[] = [];
    const val = (m: Map<string, number>, k: string) => round2(m.get(k) ?? 0);

    const activityBlock = (
      title: string,
      inflowKeys: string[],
      outflowKeys: string[],
      netLabel: string,
    ): { cur: number; ytd: number } => {
      rows.push({ code: null, label: title, level: 0, kind: 'section', current: 0, compare: 0 });

      if (!condensed)
        rows.push({
          code: null,
          label: 'Cash Inflows',
          level: 1,
          kind: 'header',
          current: 0,
          compare: 0,
        });
      let inCur = 0;
      let inYtd = 0;
      for (const k of inflowKeys) {
        const c = val(cur, k);
        const y = val(ytd, k);
        inCur += c;
        inYtd += y;
        if (Math.abs(c) < 0.005 && Math.abs(y) < 0.005) continue;
        if (!condensed)
          rows.push({
            code: null,
            label: CATEGORY_LABEL[k]!,
            level: 2,
            kind: 'account',
            current: c,
            compare: y,
          });
      }
      rows.push({
        code: null,
        label: 'Total Cash Inflows',
        level: 1,
        kind: 'total',
        current: round2(inCur),
        compare: round2(inYtd),
      });

      if (!condensed)
        rows.push({
          code: null,
          label: 'Cash Outflows',
          level: 1,
          kind: 'header',
          current: 0,
          compare: 0,
        });
      let outCur = 0;
      let outYtd = 0;
      for (const k of outflowKeys) {
        const c = val(cur, k);
        const y = val(ytd, k);
        outCur += c;
        outYtd += y;
        if (Math.abs(c) < 0.005 && Math.abs(y) < 0.005) continue;
        if (!condensed)
          rows.push({
            code: null,
            label: CATEGORY_LABEL[k]!,
            level: 2,
            kind: 'account',
            current: c,
            compare: y,
          });
      }
      rows.push({
        code: null,
        label: 'Total Cash Outflows',
        level: 1,
        kind: 'total',
        current: round2(outCur),
        compare: round2(outYtd),
      });

      const netC = round2(inCur - outCur);
      const netY = round2(inYtd - outYtd);
      rows.push({
        code: null,
        label: netLabel,
        level: 0,
        kind: 'total',
        current: netC,
        compare: netY,
      });
      rows.push({ code: null, label: '', level: 0, kind: 'spacer', current: 0, compare: 0 });
      return { cur: netC, ytd: netY };
    };

    const op = activityBlock(
      'CASH FLOWS FROM OPERATING ACTIVITIES',
      ['collect_income', 'collect_recv', 'trust_recv', 'other_recv'],
      [
        'pay_ps',
        'pay_mooe',
        'pay_fin',
        'pay_exp',
        'purch_inv',
        'cash_adv',
        'prepay',
        'pay_ap',
        'remit',
        'other_disb',
      ],
      'Net Cash Provided by (Used in) Operating Activities',
    );
    const inv = activityBlock(
      'CASH FLOWS FROM INVESTING ACTIVITIES',
      ['sale_ppe', 'sale_asset'],
      ['purch_ppe', 'purch_intang'],
      'Net Cash Provided by (Used in) Investing Activities',
    );
    const fin = activityBlock(
      'CASH FLOWS FROM FINANCING ACTIVITIES',
      ['loan_proceeds', 'contrib'],
      ['pay_loans', 'redeem', 'pay_interest'],
      'Net Cash Provided by (Used in) Financing Activities',
    );

    const netFlowCur = round2(op.cur + inv.cur + fin.cur);
    const netFlowYtd = round2(op.ytd + inv.ytd + fin.ytd);
    endingCash = round2(endingCash);
    endingCashCmp = round2(endingCashCmp);
    const endCmp = annual ? endingCashCmp : endingCash;
    const beginningCur = round2(endingCash - netFlowCur);
    const beginningYtd = round2(endCmp - netFlowYtd);

    rows.push({
      code: null,
      label: 'NET CASH FLOW',
      level: 0,
      kind: 'grand_total',
      current: netFlowCur,
      compare: netFlowYtd,
    });
    rows.push({
      code: null,
      label: 'Add: Cash and Cash Equivalents, Beginning',
      level: 0,
      kind: 'total',
      current: beginningCur,
      compare: beginningYtd,
    });
    rows.push({
      code: null,
      label: 'Cash and Cash Equivalents, Ending',
      level: 0,
      kind: 'grand_total',
      current: endingCash,
      compare: endCmp,
    });

    const monthName = MONTHS[selected.periodNumber - 1] ?? selected.name.toUpperCase();

    return {
      kind: 'scf',
      title: `${condensed ? 'CONDENSED' : 'DETAILED'} STATEMENT OF CASH FLOWS`,
      organizationName: await this.orgName(organizationId),
      headingPeriod: annual
        ? `FOR THE YEAR ENDED DECEMBER 31, ${fiscalYear.year}`
        : `FOR THE MONTH OF ${titleCase(monthName)} ${fiscalYear.year}`,
      currentLabel: annual ? `${fiscalYear.year}` : 'Current Month',
      compareLabel: annual ? `${fiscalYear.year - 1}` : 'Year to Date',
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      period: { id: selected.id, name: selected.name, periodNumber: selected.periodNumber },
      rows,
      totals: {
        netOperating: op.ytd,
        netInvesting: inv.ytd,
        netFinancing: fin.ytd,
        netCashFlowYtd: netFlowYtd,
        cashEnding: endingCash,
      },
      preparedBy: 'Accountant',
      notedBy: 'General Manager',
    };
  }

  /** Maps a contra account to a cash-flow line key (null = excluded from flows). */
  private classifyFlow(type: CoaRow['type'], code: string, dir: 'in' | 'out'): string | null {
    if (type === 'equity') return null; // opening balances / capital → folded into Beginning
    if (code.startsWith('1-01')) return null; // internal cash transfer
    if (type === 'revenue') return 'collect_income';
    if (type === 'expense') {
      if (code.startsWith('5-01')) return 'pay_ps';
      if (code.startsWith('5-02')) return 'pay_mooe';
      if (code.startsWith('5-03')) return 'pay_fin';
      if (code.startsWith('5-05')) return null; // non-cash (depreciation)
      return 'pay_exp';
    }
    if (type === 'asset') {
      if (code.startsWith('1-03')) return 'collect_recv';
      if (code.startsWith('1-04') || code.startsWith('1-05')) return 'purch_inv';
      if (code.startsWith('1-06') || code.startsWith('1-07'))
        return dir === 'in' ? 'sale_ppe' : 'purch_ppe';
      if (code.startsWith('1-08')) return 'purch_intang';
      if (code.startsWith('1-99-01')) return 'cash_adv';
      if (code.startsWith('1-99-02')) return 'prepay';
      return dir === 'in' ? 'other_recv' : 'other_disb';
    }
    if (type === 'liability') {
      if (code.startsWith('2-01-02')) return dir === 'in' ? 'loan_proceeds' : 'pay_loans';
      if (code.startsWith('2-01-01')) return 'pay_ap';
      if (code.startsWith('2-02')) return dir === 'in' ? 'trust_recv' : 'remit';
      if (code.startsWith('2-04')) return dir === 'in' ? 'trust_recv' : 'other_disb';
      return dir === 'in' ? 'other_recv' : 'other_disb';
    }
    return dir === 'in' ? 'other_recv' : 'other_disb';
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async orgName(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    return (org?.name ?? '').toUpperCase();
  }

  private async lastPeriodWithActivity(
    organizationId: string,
    fiscalYearId: string,
  ): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT ap.id
         FROM accounting_periods ap
         JOIN journal_entry_vouchers j ON j.accounting_period_id = ap.id
        WHERE ap.fiscal_year_id = $2::uuid
          AND j.organization_id = $1::uuid
          AND j.status IN ('posted','reversed')
        ORDER BY ap.period_number DESC
        LIMIT 1`,
      organizationId,
      fiscalYearId,
    );
    return rows[0]?.id ?? null;
  }

  private async windowedSums(
    organizationId: string,
    fiscalYearId: string,
    periodNumber: number,
    periodId: string,
  ): Promise<Sums[]> {
    return this.prisma.$queryRawUnsafe<Sums[]>(
      `SELECT c.id AS "accountId",
              COALESCE(SUM(CASE WHEN ap.period_number <= $3 THEN l.debit_amount  ELSE 0 END),0)::text AS "cumDebit",
              COALESCE(SUM(CASE WHEN ap.period_number <= $3 THEN l.credit_amount ELSE 0 END),0)::text AS "cumCredit",
              COALESCE(SUM(CASE WHEN ap.id = $4::uuid   THEN l.debit_amount  ELSE 0 END),0)::text AS "monthDebit",
              COALESCE(SUM(CASE WHEN ap.id = $4::uuid   THEN l.credit_amount ELSE 0 END),0)::text AS "monthCredit"
         FROM chart_of_accounts c
         LEFT JOIN jev_lines l ON l.chart_of_account_id = c.id
         LEFT JOIN journal_entry_vouchers j
                ON j.id = l.jev_id AND j.organization_id = $1::uuid AND j.status IN ('posted','reversed')
         LEFT JOIN accounting_periods ap
                ON ap.id = j.accounting_period_id AND ap.fiscal_year_id = $2::uuid
        WHERE c.organization_id = $1::uuid AND c.is_active = true
        GROUP BY c.id`,
      organizationId,
      fiscalYearId,
      periodNumber,
      periodId,
    );
  }

  private async fullYearSums(
    organizationId: string,
    fiscalYearId: string,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    const rows = await this.prisma.$queryRawUnsafe<
      { accountId: string; debit: string; credit: string }[]
    >(
      `SELECT c.id AS "accountId",
              COALESCE(SUM(l.debit_amount),0)::text  AS debit,
              COALESCE(SUM(l.credit_amount),0)::text AS credit
         FROM chart_of_accounts c
         LEFT JOIN jev_lines l ON l.chart_of_account_id = c.id
         LEFT JOIN journal_entry_vouchers j
                ON j.id = l.jev_id AND j.organization_id = $1::uuid AND j.status IN ('posted','reversed')
         LEFT JOIN accounting_periods ap
                ON ap.id = j.accounting_period_id AND ap.fiscal_year_id = $2::uuid
        WHERE c.organization_id = $1::uuid AND c.is_active = true
          AND ap.id IS NOT NULL
        GROUP BY c.id`,
      organizationId,
      fiscalYearId,
    );
    return new Map(
      rows.map((r) => [r.accountId, { debit: Number(r.debit), credit: Number(r.credit) }]),
    );
  }

  private async cashFlowLines(
    organizationId: string,
    fiscalYearId: string,
    maxPeriod: number,
  ): Promise<CashFlowLine[]> {
    return this.prisma.$queryRawUnsafe<CashFlowLine[]>(
      `SELECT j.id AS "jevId", ap.period_number AS "periodNumber",
              c.account_code AS code, c.account_type AS type,
              l.debit_amount AS debit, l.credit_amount AS credit
         FROM journal_entry_vouchers j
         JOIN accounting_periods ap ON ap.id = j.accounting_period_id AND ap.fiscal_year_id = $2::uuid
         JOIN jev_lines l ON l.jev_id = j.id
         JOIN chart_of_accounts c ON c.id = l.chart_of_account_id
        WHERE j.organization_id = $1::uuid AND j.status IN ('posted','reversed')
          AND ap.period_number <= $3
        ORDER BY j.id`,
      organizationId,
      fiscalYearId,
      maxPeriod,
    );
  }

  /**
   * Statement of Changes in Equity. Reconciles each equity component from the
   * start-of-year balance through the year's comprehensive income to the
   * year-end balance. The current-year surplus (Income − Expenses), not yet
   * closed to Retained Earnings, is shown as this year's comprehensive income —
   * so the ending Total ties to Total Equity on the SFP.
   */
  async getChangesInEquity(
    organizationId: string,
    filters: { fiscalYearId?: string },
  ): Promise<ChangesInEquityResult> {
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

    const accounts = await this.prisma.$queryRawUnsafe<CoaRow[]>(
      `SELECT id, account_code AS code, name, account_type AS type, level, is_header AS "isHeader"
         FROM chart_of_accounts
        WHERE organization_id = $1::uuid AND is_active = true
        ORDER BY account_code`,
      organizationId,
    );
    const sums = await this.fullYearSums(organizationId, fiscalYear.id);

    const creditBal = (match: (code: string) => boolean) => {
      let bal = 0;
      for (const a of accounts) {
        if (a.isHeader || !match(a.code)) continue;
        const s = sums.get(a.id);
        bal += Number(s?.credit ?? 0) - Number(s?.debit ?? 0);
      }
      return round2(bal);
    };

    const govEquity = creditBal((c) => c.startsWith('3-01-01-020'));
    const contribCap = creditBal((c) => c.startsWith('3-01-01-030'));
    const totalEquity = creditBal((c) => c.startsWith('3'));
    // Retained-earnings component = all equity not captured by the other columns.
    const reOpening = round2(totalEquity - govEquity - contribCap);

    let rev = 0;
    let exp = 0;
    for (const a of accounts) {
      if (a.isHeader) continue;
      const s = sums.get(a.id);
      const dr = Number(s?.debit ?? 0);
      const cr = Number(s?.credit ?? 0);
      if (a.type === 'revenue') rev += cr - dr;
      if (a.type === 'expense') exp += dr - cr;
    }
    const netIncome = round2(rev - exp);
    const reEnding = round2(reOpening + netIncome);

    const begTotal = round2(govEquity + contribCap + reOpening);
    const endTotal = round2(govEquity + contribCap + reEnding);

    const rows: SceRow[] = [
      {
        label: `Balance at January 1, ${fiscalYear.year}`,
        level: 0,
        kind: 'total',
        values: [govEquity, contribCap, reOpening, begTotal],
      },
      { label: '', level: 0, kind: 'spacer', values: [0, 0, 0, 0] },
      {
        label: `Changes in Equity for ${fiscalYear.year}`,
        level: 0,
        kind: 'header',
        values: [0, 0, 0, 0],
      },
      {
        label: 'Comprehensive Income for the year',
        level: 1,
        kind: 'account',
        values: [0, 0, netIncome, netIncome],
      },
      { label: 'Other Adjustments', level: 1, kind: 'account', values: [0, 0, 0, 0] },
      { label: '', level: 0, kind: 'spacer', values: [0, 0, 0, 0] },
      {
        label: `Balance at December 31, ${fiscalYear.year}`,
        level: 0,
        kind: 'total',
        values: [govEquity, contribCap, reEnding, endTotal],
      },
    ];

    return {
      title: 'STATEMENT OF CHANGES IN EQUITY',
      organizationName: await this.orgName(organizationId),
      headingPeriod: `FOR THE YEAR ENDED DECEMBER 31, ${fiscalYear.year}`,
      columns: [
        'Government Equity',
        'Contributed Capital',
        'Retained Earnings / (Deficit)',
        'Total',
      ],
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      rows,
      preparedBy: 'Accountant',
      notedBy: 'General Manager',
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
