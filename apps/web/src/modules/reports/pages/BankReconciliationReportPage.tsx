import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getReconciliations } from '../../accounting/api';
import type { BankReconciliationListItem } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

/**
 * Bank Reconciliation Report — read-only view of reconciliations. The working
 * reconciliation screen (select account/period, clear items, record
 * adjustments, complete) stays in Accounting → Bank Reconciliation.
 */
export function BankReconciliationReportPage() {
  const [rows, setRows] = useState<BankReconciliationListItem[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    getReconciliations()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reconciliations.'));
  }, []);

  const statuses = useMemo(() => [...new Set((rows ?? []).map((r) => r.status))].sort(), [rows]);
  const filtered = (rows ?? []).filter((r) => status === 'all' || r.status === status);

  return (
    <div>
      <h2>Bank Reconciliation Report</h2>
      <p className="reports-subtitle">
        Read-only summary of bank reconciliations. To perform a reconciliation, use{' '}
        <Link to="/accounting/reconciliations" className="reports-link">
          Accounting → Bank Reconciliation
        </Link>
        .
      </p>

      <div className="reports-filters">
        <label htmlFor="rec-status">Status</label>
        <select id="rec-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!rows && !error && <div className="reports-loading">Loading…</div>}
      {rows && filtered.length === 0 && (
        <div className="reports-empty">No bank reconciliations found for the selected status.</div>
      )}
      {rows && filtered.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Bank Account</th>
                <th>Statement Date</th>
                <th>Period</th>
                <th className="num">Book Balance</th>
                <th className="num">Adj. Book</th>
                <th className="num">Bank Balance</th>
                <th className="num">Adj. Bank</th>
                <th className="num">Difference</th>
                <th>Status</th>
                <th>Prepared By</th>
                <th>Approved By</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.bankAccount.bank.name} · {r.bankAccount.accountNumber}
                  </td>
                  <td>{new Date(r.reconciliationDate).toLocaleDateString('en-PH')}</td>
                  <td>{r.accountingPeriod?.name ?? '—'}</td>
                  <td className="num">{formatPeso(r.bookBalance)}</td>
                  <td className="num">{formatPeso(r.adjustedBookBalance)}</td>
                  <td className="num">{formatPeso(r.bankBalance)}</td>
                  <td className="num">{formatPeso(r.adjustedBankBalance)}</td>
                  <td
                    className="num"
                    style={{ color: Number(r.difference) === 0 ? '#15803d' : '#b91c1c' }}
                  >
                    {formatPeso(r.difference)}
                  </td>
                  <td>
                    <span className={`reports-badge reports-badge--${r.status}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{r.preparer?.username ?? '—'}</td>
                  <td>{r.approver?.username ?? '—'}</td>
                  <td>{r.approvedAt ? new Date(r.approvedAt).toLocaleDateString('en-PH') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
