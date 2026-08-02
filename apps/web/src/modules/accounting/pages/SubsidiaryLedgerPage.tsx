import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';
import { getSubsidiaryLedger, getGlFiscalYears, getGlPeriods } from '../api';
import type { SubsidiaryLedgerResult, FiscalYearOption, PeriodOption } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: SubsidiaryLedgerResult };

export default function SubsidiaryLedgerPage() {
  const { accountId } = useParams<{ accountId: string }>();
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
    if (!accountId) return;
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    if (selectedPeriod) params.set('periodId', selectedPeriod);
    getSubsidiaryLedger(accountId, params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [accountId, selectedPeriod]);

  const account = state.status === 'loaded' ? state.data.account : null;
  const entries = state.status === 'loaded' ? state.data.entries : [];

  let runningBalance = 0;
  const entriesWithBalance = entries.map((e) => {
    const debit = parseFloat(e.debitAmount);
    const credit = parseFloat(e.creditAmount);
    if (account?.normalBalance === 'debit') {
      runningBalance += debit - credit;
    } else {
      runningBalance += credit - debit;
    }
    return { ...e, runningBalance };
  });

  const totalDebit = entries.reduce((s, e) => s + parseFloat(e.debitAmount), 0);
  const totalCredit = entries.reduce((s, e) => s + parseFloat(e.creditAmount), 0);

  return (
    <div className="acct-page">
      <AccountingSubNav />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link to="/accounting/gl/trial-balance" className="acct-btn acct-btn--sm">&larr; Trial Balance</Link>
        <Link to="/accounting/gl" className="acct-btn acct-btn--sm">&larr; General Ledger</Link>
      </div>

      {account && (
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ marginBottom: 4 }}>
            {account.accountCode} — {account.name}
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`acct-badge acct-badge--${account.accountType}`}>{account.accountType}</span>
            <span style={{ fontSize: 13, color: '#667085' }}>
              Normal balance: {account.normalBalance}
            </span>
          </div>
        </div>
      )}

      <div className="acct-toolbar">
        <select value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>FY {fy.year} — {fy.name}</option>
          ))}
        </select>
        <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
          <option value="">All Periods</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}

      {state.status === 'loaded' && entries.length === 0 && (
        <div className="acct-empty">No posted transactions for this account.</div>
      )}

      {state.status === 'loaded' && entries.length > 0 && (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>JEV #</th>
              <th>Particulars</th>
              <th>Source</th>
              <th>Period</th>
              <th className="acct-text-right">Debit</th>
              <th className="acct-text-right">Credit</th>
              <th className="acct-text-right">Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {entriesWithBalance.map((entry) => (
              <tr key={entry.jevLineId}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(entry.jevDate).toLocaleDateString()}</td>
                <td>
                  <Link to={`/accounting/jev/${entry.jevId}`} className="acct-table__link">
                    {entry.jevNumber}
                  </Link>
                </td>
                <td>{entry.particulars}</td>
                <td><span className={`acct-badge acct-badge--${entry.sourceType}`}>{entry.sourceType}</span></td>
                <td>{entry.periodName}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(entry.debitAmount)}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(entry.creditAmount)}</td>
                <td className="acct-text-right acct-text-mono" style={{ fontWeight: 600 }}>
                  {formatPeso(entry.runningBalance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy)' }}>
              <td colSpan={5}>Total</td>
              <td className="acct-text-right acct-text-mono">{formatPeso(totalDebit)}</td>
              <td className="acct-text-right acct-text-mono">{formatPeso(totalCredit)}</td>
              <td className="acct-text-right acct-text-mono">{formatPeso(runningBalance)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
