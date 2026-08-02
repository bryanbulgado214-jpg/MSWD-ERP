import { useEffect, useState } from 'react';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';
import { getFinancialStatements, getGlFiscalYears, getGlPeriods } from '../api';
import type { FinancialStatementResult, FinancialStatementRow, FiscalYearOption, PeriodOption } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

type ViewMode = 'sfp' | 'sfperf';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: FinancialStatementResult };

function StatementSection({
  title,
  rows,
  totalLabel,
  totalAmount,
}: {
  title: string;
  rows: FinancialStatementRow[];
  totalLabel: string;
  totalAmount: string;
}) {
  const postable = rows.filter((r) => !r.isHeader && parseFloat(r.balance) !== 0);

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--mswd-navy)', textTransform: 'uppercase', fontSize: 13, letterSpacing: '0.04em' }}>
        {title}
      </h3>
      <table className="acct-table" style={{ marginBottom: 0 }}>
        <tbody>
          {postable.map((row) => (
            <tr key={row.accountId}>
              <td style={{ paddingLeft: (row.level - 1) * 16 }}>
                <span style={{ color: '#667085', fontSize: 12, marginRight: 8 }}>{row.accountCode}</span>
                {row.accountName}
              </td>
              <td className="acct-text-right acct-text-mono" style={{ width: 150 }}>
                {formatPeso(row.balance)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy)' }}>
            <td>{totalLabel}</td>
            <td className="acct-text-right acct-text-mono" style={{ width: 150 }}>{formatPeso(totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function FinancialStatementsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('sfp');
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    getGlFiscalYears().then((fy) => {
      setFiscalYears(fy);
      if (fy.length > 0) setSelectedFY(fy[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedFY) return;
    setSelectedPeriod('');
    getGlPeriods(selectedFY).then(setPeriods);
  }, [selectedFY]);

  useEffect(() => {
    if (!selectedFY) return;
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    if (selectedPeriod) {
      params.set('periodId', selectedPeriod);
    } else {
      params.set('fiscalYearId', selectedFY);
    }
    getFinancialStatements(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [selectedFY, selectedPeriod]);

  const data = state.status === 'loaded' ? state.data : null;

  const assetRows = data?.rows.filter((r) => r.accountType === 'asset') ?? [];
  const liabilityRows = data?.rows.filter((r) => r.accountType === 'liability') ?? [];
  const equityRows = data?.rows.filter((r) => r.accountType === 'equity') ?? [];
  const revenueRows = data?.rows.filter((r) => r.accountType === 'revenue') ?? [];
  const expenseRows = data?.rows.filter((r) => r.accountType === 'expense') ?? [];

  return (
    <div className="acct-page">
      <AccountingSubNav />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          {viewMode === 'sfp' ? 'Statement of Financial Position' : 'Statement of Financial Performance'}
        </h1>
        <button className="acct-btn" onClick={() => window.print()} style={{ fontSize: 12 }}>
          Print
        </button>
      </div>

      <div className="acct-toolbar">
        <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
          <option value="sfp">Statement of Financial Position (Balance Sheet)</option>
          <option value="sfperf">Statement of Financial Performance (Income Statement)</option>
        </select>

        <select value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>FY {fy.year} — {fy.name}</option>
          ))}
        </select>

        <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
          <option value="">Full Year</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}

      {data && (
        <div className="acct-form" style={{ padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--mswd-navy)' }}>
              Metro Siquijor Water District
            </div>
            <div style={{ fontSize: 14, color: '#475467' }}>
              {viewMode === 'sfp'
                ? 'Statement of Financial Position'
                : 'Statement of Financial Performance'}
            </div>
            <div style={{ fontSize: 13, color: '#667085' }}>
              {viewMode === 'sfp'
                ? `As of ${data.periodName}`
                : `For the period: ${data.periodName}`}
            </div>
          </div>

          {viewMode === 'sfp' && (
            <>
              <StatementSection title="Assets" rows={assetRows} totalLabel="Total Assets" totalAmount={data.totalAssets} />
              <StatementSection title="Liabilities" rows={liabilityRows} totalLabel="Total Liabilities" totalAmount={data.totalLiabilities} />
              <StatementSection title="Equity" rows={equityRows} totalLabel="Total Equity" totalAmount={data.totalEquity} />

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, borderTop: '3px double var(--mswd-navy)', marginTop: 8 }}>
                <span>Total Liabilities & Equity</span>
                <span className="acct-text-mono">
                  {formatPeso(parseFloat(data.totalLiabilities) + parseFloat(data.totalEquity) + parseFloat(data.netIncome))}
                </span>
              </div>

              <div style={{ textAlign: 'center', marginTop: 16, padding: 8, borderRadius: 6, background: Math.abs(parseFloat(data.totalAssets) - (parseFloat(data.totalLiabilities) + parseFloat(data.totalEquity) + parseFloat(data.netIncome))) < 0.01 ? '#ecfdf3' : '#fef3f2' }}>
                <span style={{ fontWeight: 600, color: Math.abs(parseFloat(data.totalAssets) - (parseFloat(data.totalLiabilities) + parseFloat(data.totalEquity) + parseFloat(data.netIncome))) < 0.01 ? '#067647' : '#b42318' }}>
                  {Math.abs(parseFloat(data.totalAssets) - (parseFloat(data.totalLiabilities) + parseFloat(data.totalEquity) + parseFloat(data.netIncome))) < 0.01
                    ? 'Assets = Liabilities + Equity (Balanced)'
                    : `Imbalance: ${formatPeso(parseFloat(data.totalAssets) - parseFloat(data.totalLiabilities) - parseFloat(data.totalEquity) - parseFloat(data.netIncome))}`}
                </span>
              </div>
            </>
          )}

          {viewMode === 'sfperf' && (
            <>
              <StatementSection title="Revenue" rows={revenueRows} totalLabel="Total Revenue" totalAmount={data.totalRevenue} />
              <StatementSection title="Expenses" rows={expenseRows} totalLabel="Total Expenses" totalAmount={data.totalExpenses} />

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 700, fontSize: 16, borderTop: '3px double var(--mswd-navy)', marginTop: 8 }}>
                <span>Net Income / (Loss)</span>
                <span className="acct-text-mono" style={{ color: parseFloat(data.netIncome) >= 0 ? '#067647' : '#b42318' }}>
                  {formatPeso(data.netIncome)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
