import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import './accounting.css';
import { getTrialBalance, getGlFiscalYears, getGlPeriods } from '../api';
import type { TrialBalanceRow, FiscalYearOption, PeriodOption } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: TrialBalanceRow[] };

export default function TrialBalancePage() {
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
    getTrialBalance(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [selectedFY, selectedPeriod]);

  const rows = state.status === 'loaded' ? state.data : [];
  const totalDebit = rows.reduce((s, r) => s + parseFloat(r.totalDebit), 0);
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.totalCredit), 0);

  return (
    <div className="acct-page acct-page--embedded">
      <h1>Trial Balance</h1>

      <div className="acct-toolbar">
        <select value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              FY {fy.year} — {fy.name}
            </option>
          ))}
        </select>

        <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
          <option value="">All Periods</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}

      {state.status === 'loaded' && rows.length === 0 && (
        <div className="acct-empty">No posted transactions found for the selected period.</div>
      )}

      {state.status === 'loaded' && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th className="acct-text-right">Debit</th>
                <th className="acct-text-right">Credit</th>
                <th className="acct-text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.accountId}>
                  <td>
                    <Link
                      to={`/reports/subsidiary-ledgers/${row.accountId}`}
                      className="acct-table__link"
                    >
                      {row.accountCode}
                    </Link>
                  </td>
                  <td>{row.accountName}</td>
                  <td>
                    <span className={`acct-badge acct-badge--${row.accountType}`}>
                      {row.accountType}
                    </span>
                  </td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(row.totalDebit)}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(row.totalCredit)}</td>
                  <td className="acct-text-right acct-text-mono" style={{ fontWeight: 600 }}>
                    {formatPeso(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy)' }}>
                <td colSpan={3}>Total</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(totalDebit)}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(totalCredit)}</td>
                <td className="acct-text-right acct-text-mono">
                  {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                    <span style={{ color: '#067647' }}>Balanced</span>
                  ) : (
                    <span style={{ color: '#b42318' }}>
                      Off by {formatPeso(Math.abs(totalDebit - totalCredit))}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
