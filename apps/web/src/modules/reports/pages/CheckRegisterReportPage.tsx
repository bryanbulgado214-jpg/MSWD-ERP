import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getChecks } from '../../accounting/api';
import type { CheckListItem } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

/**
 * Check Register — read-only report of check history. Preparing, printing,
 * releasing and voiding checks stays in Accounting → Checks.
 */
export function CheckRegisterReportPage() {
  const [rows, setRows] = useState<CheckListItem[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [bank, setBank] = useState('all');

  useEffect(() => {
    getChecks()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load checks.'));
  }, []);

  const banks = useMemo(() => {
    const m = new Map<string, string>();
    rows?.forEach((r) =>
      m.set(r.bankAccount.id, `${r.bankAccount.bank.name} · ${r.bankAccount.accountNumber}`),
    );
    return [...m.entries()];
  }, [rows]);

  const statuses = useMemo(() => [...new Set((rows ?? []).map((r) => r.status))].sort(), [rows]);

  const filtered = (rows ?? []).filter(
    (r) =>
      (status === 'all' || r.status === status) && (bank === 'all' || r.bankAccount.id === bank),
  );
  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <h2>Check Register</h2>
      <p className="reports-subtitle">
        Read-only history of checks. To prepare, print, release, or void checks, use{' '}
        <Link to="/accounting/checks" className="reports-link">
          Accounting → Checks
        </Link>
        .
      </p>

      <div className="reports-filters">
        <label htmlFor="ck-status">Status</label>
        <select id="ck-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <label htmlFor="ck-bank">Bank Account</label>
        <select id="ck-bank" value={bank} onChange={(e) => setBank(e.target.value)}>
          <option value="all">All bank accounts</option>
          {banks.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!rows && !error && <div className="reports-loading">Loading…</div>}
      {rows && filtered.length === 0 && (
        <div className="reports-empty">No checks found for the selected filters.</div>
      )}
      {rows && filtered.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Check Date</th>
                <th>Check #</th>
                <th>Bank Account</th>
                <th>Payee</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>DV #</th>
                <th>Prepared By</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.checkDate).toLocaleDateString('en-PH')}</td>
                  <td className="code">
                    {r.checkNumber ?? <em style={{ color: '#98a2b3' }}>pending</em>}
                  </td>
                  <td>
                    {r.bankAccount.bank.name} · {r.bankAccount.accountNumber}
                  </td>
                  <td>{r.payeeName}</td>
                  <td className="num">{formatPeso(r.amount)}</td>
                  <td>
                    <span className={`reports-badge reports-badge--${r.status}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="code">{r.disbursementVoucher?.dvNumber ?? '—'}</td>
                  <td>{r.creator?.username ?? '—'}</td>
                  <td>
                    {r.voidReason ??
                      (r.clearedDate
                        ? `Cleared ${new Date(r.clearedDate).toLocaleDateString('en-PH')}`
                        : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  Total · {filtered.length} {filtered.length === 1 ? 'check' : 'checks'}
                </td>
                <td className="num">{formatPeso(total)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
