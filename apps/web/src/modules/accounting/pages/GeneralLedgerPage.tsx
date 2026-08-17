import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import './accounting.css';
import { getGeneralLedger, getGlFiscalYears } from '../api';
import type { GeneralLedgerRow, FiscalYearOption } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

const ACCOUNT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'asset', label: 'Assets' },
  { value: 'liability', label: 'Liabilities' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expenses' },
];

interface AccountGroup {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  periods: Map<string, { totalDebit: string; totalCredit: string; balance: string }>;
  grandDebit: number;
  grandCredit: number;
  grandBalance: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: GeneralLedgerRow[] };

export default function GeneralLedgerPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [accountType, setAccountType] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    getGlFiscalYears().then((fy) => {
      setFiscalYears(fy);
      const first = fy[0];
      if (first) setSelectedFY(first.id);
    });
  }, []);

  useEffect(() => {
    if (!selectedFY) return;
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    params.set('fiscalYearId', selectedFY);
    if (accountType) params.set('accountType', accountType);
    getGeneralLedger(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [selectedFY, accountType]);

  const rows = state.status === 'loaded' ? state.data : [];

  const { periodColumns, accountGroups } = useMemo(() => {
    const periodMap = new Map<string, { name: string; number: number }>();
    const acctMap = new Map<string, AccountGroup>();

    for (const row of rows) {
      if (!periodMap.has(row.periodId)) {
        periodMap.set(row.periodId, { name: row.periodName, number: row.periodNumber });
      }

      let acct = acctMap.get(row.accountId);
      if (!acct) {
        acct = {
          accountId: row.accountId,
          accountCode: row.accountCode,
          accountName: row.accountName,
          accountType: row.accountType,
          normalBalance: row.normalBalance,
          periods: new Map(),
          grandDebit: 0,
          grandCredit: 0,
          grandBalance: 0,
        };
        acctMap.set(row.accountId, acct);
      }
      acct.periods.set(row.periodId, {
        totalDebit: row.totalDebit,
        totalCredit: row.totalCredit,
        balance: row.balance,
      });
      acct.grandDebit += parseFloat(row.totalDebit);
      acct.grandCredit += parseFloat(row.totalCredit);
      acct.grandBalance += parseFloat(row.balance);
    }

    const cols = Array.from(periodMap.entries())
      .sort((a, b) => a[1].number - b[1].number)
      .map(([id, info]) => ({ id, name: info.name }));

    return {
      periodColumns: cols,
      accountGroups: Array.from(acctMap.values()).sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode),
      ),
    };
  }, [rows]);

  return (
    <div className="acct-page acct-page--embedded">
      <h1>General Ledger</h1>

      <div className="acct-toolbar">
        <select value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              FY {fy.year} — {fy.name}
            </option>
          ))}
        </select>

        <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}

      {state.status === 'loaded' && accountGroups.length === 0 && (
        <div className="acct-empty">No posted transactions found for the selected fiscal year.</div>
      )}

      {state.status === 'loaded' && accountGroups.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table" style={{ minWidth: 600 + periodColumns.length * 120 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                  Account
                </th>
                <th>Type</th>
                {periodColumns.map((col) => (
                  <th key={col.id} className="acct-text-right">
                    {col.name}
                  </th>
                ))}
                <th className="acct-text-right" style={{ fontWeight: 800 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {accountGroups.map((acct) => (
                <tr key={acct.accountId}>
                  <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    <Link
                      to={`/reports/subsidiary-ledgers/${acct.accountId}`}
                      className="acct-table__link"
                    >
                      {acct.accountCode}
                    </Link>
                    <span style={{ marginLeft: 8, color: '#667085', fontSize: 12 }}>
                      {acct.accountName}
                    </span>
                  </td>
                  <td>
                    <span className={`acct-badge acct-badge--${acct.accountType}`}>
                      {acct.accountType}
                    </span>
                  </td>
                  {periodColumns.map((col) => {
                    const p = acct.periods.get(col.id);
                    return (
                      <td key={col.id} className="acct-text-right acct-text-mono">
                        {p ? formatPeso(p.balance) : '—'}
                      </td>
                    );
                  })}
                  <td className="acct-text-right acct-text-mono" style={{ fontWeight: 600 }}>
                    {formatPeso(acct.grandBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
