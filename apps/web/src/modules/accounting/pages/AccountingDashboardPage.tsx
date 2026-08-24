import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getAccountingDashboard } from '../api';
import type { AccountingDashboardResult } from '../types';

import AccountantWorkspace from './AccountantWorkspace';
import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function peso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: AccountingDashboardResult };

function KpiCard({
  label,
  value,
  to,
  accent,
  sub,
}: {
  label: string;
  value: string;
  to: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <Link
      to={to}
      className="acct-kpi"
      style={{ borderTop: `3px solid ${accent ?? 'var(--mswd-blue)'}` }}
      title="Click to drill down"
    >
      <div className="acct-kpi__label">{label}</div>
      <div className="acct-kpi__value">{value}</div>
      {sub && <div className="acct-kpi__sub">{sub}</div>}
    </Link>
  );
}

export default function AccountingDashboardPage() {
  const { organization } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    getAccountingDashboard()
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({ status: 'error', message: e.message ?? 'Failed to load dashboard.' }),
      );
  }, []);

  return (
    <div className="acct-page">
      <AccountingSubNav />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <h1 style={{ margin: 0 }}>Accounting Dashboard</h1>
        {state.status === 'loaded' && (
          <span style={{ color: '#667085', fontSize: 13 }}>
            {organization?.name} · {state.data.fiscalYear.name} · as of {state.data.asOf}
          </span>
        )}
      </div>

      <AccountantWorkspace />

      <h2 className="acct-section-heading">Financial Snapshot</h2>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 20px' }}>
        Every figure is computed live from posted journal-entry lines. Click any card to drill down.
      </p>

      {state.status === 'loading' && <div className="acct-empty">Loading…</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}

      {state.status === 'loaded' &&
        (() => {
          const d = state.data;
          const fy = d.fiscalYear.id;
          const net = parseFloat(d.netSurplus);
          return (
            <>
              <h3 className="acct-kpi-group">Position (as of period end)</h3>
              <div className="acct-kpi-grid">
                <KpiCard
                  label="Cash & Cash Equivalents"
                  value={peso(d.cash)}
                  accent="#12b76a"
                  to={
                    d.cashAccountId
                      ? `/reports/subsidiary-ledgers/${d.cashAccountId}`
                      : '/reports/trial-balance'
                  }
                  sub="View cash ledger →"
                />
                <KpiCard
                  label="Receivables"
                  value={peso(d.receivables)}
                  accent="#12b76a"
                  to={
                    d.receivablesAccountId
                      ? `/reports/subsidiary-ledgers/${d.receivablesAccountId}`
                      : '/reports/trial-balance'
                  }
                  sub="View AR ledger →"
                />
                <KpiCard
                  label="Total Assets"
                  value={peso(d.totalAssets)}
                  to="/reports/financial-statements"
                  sub="Statement of Financial Position →"
                />
                <KpiCard
                  label="Total Liabilities"
                  value={peso(d.totalLiabilities)}
                  accent="#f79009"
                  to="/reports/financial-statements"
                  sub="Statement of Financial Position →"
                />
                <KpiCard
                  label="Total Equity"
                  value={peso(d.totalEquity)}
                  accent="#7a5af8"
                  to="/reports/financial-statements"
                  sub="Statement of Financial Position →"
                />
              </div>

              <h3 className="acct-kpi-group">Performance (year-to-date)</h3>
              <div className="acct-kpi-grid">
                <KpiCard
                  label="Revenue (YTD)"
                  value={peso(d.revenueYtd)}
                  accent="#12b76a"
                  to="/reports/financial-statements"
                  sub="Statement of Financial Performance →"
                />
                <KpiCard
                  label="Expenses (YTD)"
                  value={peso(d.expensesYtd)}
                  accent="#f04438"
                  to="/reports/financial-statements"
                  sub="Statement of Financial Performance →"
                />
                <KpiCard
                  label={net >= 0 ? 'Net Surplus (YTD)' : 'Net Deficit (YTD)'}
                  value={peso(d.netSurplus)}
                  accent={net >= 0 ? '#12b76a' : '#f04438'}
                  to="/reports/financial-statements"
                  sub="Statement of Financial Performance →"
                />
              </div>

              <h3 className="acct-kpi-group">Journal Entry Workflow · {d.fiscalYear.name}</h3>
              <div className="acct-kpi-grid">
                <KpiCard
                  label="For Review"
                  value={String(d.counts.forReview)}
                  accent={d.counts.forReview > 0 ? '#f79009' : 'var(--mswd-blue)'}
                  to="/accounting/jev?status=for_review"
                  sub="Awaiting a reviewer →"
                />
                <KpiCard
                  label="Approved (to post)"
                  value={String(d.counts.approved)}
                  accent={d.counts.approved > 0 ? '#7a5af8' : 'var(--mswd-blue)'}
                  to="/accounting/jev?status=approved"
                  sub="Awaiting posting →"
                />
                <KpiCard
                  label="Draft JEVs"
                  value={String(d.counts.draft)}
                  to="/accounting/jev?status=draft"
                  sub="Unsubmitted entries →"
                />
                <KpiCard
                  label="Posted JEVs"
                  value={String(d.counts.posted)}
                  accent="#12b76a"
                  to="/accounting/jev?status=posted"
                  sub="This fiscal year →"
                />
                <KpiCard
                  label="Reversed JEVs"
                  value={String(d.counts.reversed)}
                  accent="#b54708"
                  to={`/accounting/jev?status=reversed&fiscalYearId=${fy}`}
                  sub="Corrections →"
                />
              </div>
            </>
          );
        })()}
    </div>
  );
}
