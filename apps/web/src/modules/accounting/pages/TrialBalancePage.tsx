import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import './accounting.css';
import { getTrialBalance } from '../api';
import type { TrialBalanceRow } from '../types';

import { BreakdownModal, type BreakdownTarget } from './BreakdownModal';
import { OpeningBalanceUploadModal } from './OpeningBalanceUploadModal';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

// The Beginning / Ending columns are net-signed (debit +, credit −), so their
// total should foot to zero. Show the zero in green; flag any residual in red.
function footBalance(total: number) {
  const balanced = Math.abs(total) < 0.005;
  return (
    <span style={{ color: balanced ? '#067647' : '#b42318' }}>
      {balanced ? '₱0.00' : formatPeso(total)}
    </span>
  );
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Format a 'YYYY-MM-DD' string for display without a timezone shift.
const fmtDate = (s: string) =>
  s
    ? new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

// The day immediately before a 'YYYY-MM-DD' string — the beginning balance is
// brought forward "as of" the day before the From date.
const dayBefore = (s: string) => {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return iso(d);
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: TrialBalanceRow[] };

export default function TrialBalancePage() {
  const { permissions } = useAuth();
  const canUploadOpening = permissions.has('accounting.jev.create');
  const now = new Date();
  const [startDate, setStartDate] = useState(iso(new Date(now.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(iso(now));
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [showUpload, setShowUpload] = useState(false);
  const [flash, setFlash] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [drill, setDrill] = useState<BreakdownTarget | null>(null);

  // Open the drill-down for a period Debit/Credit cell: the postings within the
  // From–To range, excluding opening balances so the total ties to the column.
  const drillPeriod = (row: TrialBalanceRow, amount: number) =>
    setDrill({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      normalBalance: row.normalBalance,
      amount,
      startDate,
      endDate,
      excludeOpening: true,
      windowLabel: `${fmtDate(startDate)} – ${fmtDate(endDate)}`,
    });

  useEffect(() => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setState({
        status: 'error',
        message: 'The beginning date must be on or before the ending date.',
      });
      return;
    }
    setState({ status: 'loading' });
    const params = new URLSearchParams({ startDate, endDate });
    getTrialBalance(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [startDate, endDate, reloadKey]);

  const rows = state.status === 'loaded' ? state.data : [];
  const totalBeginning = rows.reduce((s, r) => s + parseFloat(r.beginningBalance), 0);
  const totalDebit = rows.reduce((s, r) => s + parseFloat(r.totalDebit), 0);
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.totalCredit), 0);
  const totalEnding = rows.reduce((s, r) => s + parseFloat(r.endingBalance), 0);

  return (
    <div className="acct-page acct-page--embedded">
      <h1>Trial Balance</h1>

      <div className="acct-toolbar">
        <label
          style={{ fontSize: 13, color: '#475467', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          From
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label
          style={{ fontSize: 13, color: '#475467', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          To
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>

        {canUploadOpening && (
          <button
            type="button"
            className="acct-btn acct-btn--sm acct-btn--primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowUpload(true)}
          >
            ⬆ Upload beginning balances
          </button>
        )}
      </div>

      {flash && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #6ce9a6',
            color: '#027a48',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {flash}
        </div>
      )}

      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}

      {state.status === 'loaded' && rows.length === 0 && (
        <div className="acct-empty">
          No account activity or balances in the selected date range.
        </div>
      )}

      {state.status === 'loaded' && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th className="acct-text-right">
                  Beginning Balance
                  <span
                    style={{ display: 'block', fontWeight: 400, fontSize: 11, color: '#667085' }}
                  >
                    as of {fmtDate(dayBefore(startDate))}
                  </span>
                </th>
                <th className="acct-text-right">Debit</th>
                <th className="acct-text-right">Credit</th>
                <th className="acct-text-right">
                  Ending Balance
                  <span
                    style={{ display: 'block', fontWeight: 400, fontSize: 11, color: '#667085' }}
                  >
                    as of {fmtDate(endDate)}
                  </span>
                </th>
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
                  <td className="acct-text-right acct-text-mono">
                    {formatPeso(row.beginningBalance)}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {parseFloat(row.totalDebit) !== 0 ? (
                      <button
                        type="button"
                        className="acct-linkish"
                        title="Show the transactions that make up this amount"
                        onClick={() => drillPeriod(row, parseFloat(row.totalDebit))}
                      >
                        {formatPeso(row.totalDebit)}
                      </button>
                    ) : (
                      formatPeso(row.totalDebit)
                    )}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {parseFloat(row.totalCredit) !== 0 ? (
                      <button
                        type="button"
                        className="acct-linkish"
                        title="Show the transactions that make up this amount"
                        onClick={() => drillPeriod(row, parseFloat(row.totalCredit))}
                      >
                        {formatPeso(row.totalCredit)}
                      </button>
                    ) : (
                      formatPeso(row.totalCredit)
                    )}
                  </td>
                  <td className="acct-text-right acct-text-mono" style={{ fontWeight: 600 }}>
                    {formatPeso(row.endingBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy)' }}>
                <td colSpan={3}>Total</td>
                <td className="acct-text-right acct-text-mono">{footBalance(totalBeginning)}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(totalDebit)}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(totalCredit)}</td>
                <td className="acct-text-right acct-text-mono">{footBalance(totalEnding)}</td>
              </tr>
              <tr>
                <td colSpan={4}></td>
                <td colSpan={3} className="acct-text-right" style={{ fontSize: 12 }}>
                  {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                    <span style={{ color: '#067647' }}>Debits and credits balanced</span>
                  ) : (
                    <span style={{ color: '#b42318' }}>
                      Debits vs credits off by {formatPeso(Math.abs(totalDebit - totalCredit))}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {drill && <BreakdownModal target={drill} onClose={() => setDrill(null)} />}

      {showUpload && (
        <OpeningBalanceUploadModal
          onClose={() => setShowUpload(false)}
          onImported={(message) => {
            setShowUpload(false);
            setFlash(message);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
