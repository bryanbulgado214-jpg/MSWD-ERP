import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getJevList } from '../../accounting/api';
import type { JevListItem } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

const STATUSES = [
  'all',
  'draft',
  'for_review',
  'approved',
  'posted',
  'voided',
  'reversed',
] as const;

/**
 * Journal Entry Register — a read-only report of journal-entry vouchers already
 * recorded in the system. It reuses the JEV list endpoint; creating, editing,
 * and posting entries stays in Accounting → Journal Entries.
 */
export function JournalEntryRegisterPage() {
  const [rows, setRows] = useState<JevListItem[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<string>('posted');

  useEffect(() => {
    let live = true;
    setRows(null);
    setError('');
    getJevList(status === 'all' ? '' : `status=${status}`)
      .then((r) => live && setRows(r))
      .catch(
        (e) => live && setError(e instanceof Error ? e.message : 'Failed to load journal entries.'),
      );
    return () => {
      live = false;
    };
  }, [status]);

  const totalDebit = rows?.reduce((s, r) => s + Number(r.totalDebit), 0) ?? 0;
  const totalCredit = rows?.reduce((s, r) => s + Number(r.totalCredit), 0) ?? 0;

  return (
    <div>
      <h2>Journal Entry Register</h2>
      <p className="reports-subtitle">
        Read-only register of journal-entry vouchers recorded in the system. To create, review, or
        post entries, use{' '}
        <Link to="/accounting/jev" className="reports-link">
          Accounting → Journal Entries
        </Link>
        .
      </p>

      <div className="reports-filters">
        <label htmlFor="je-status">Status</label>
        <select id="je-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!rows && !error && <div className="reports-loading">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="reports-empty">No journal entries found for the selected status.</div>
      )}
      {rows && rows.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>JEV #</th>
                <th>Date</th>
                <th>Period</th>
                <th>Source</th>
                <th>Particulars</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th>Status</th>
                <th>Prepared By</th>
                <th>Posted By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="code">
                    <Link to={`/accounting/jev/${r.id}`} className="reports-link">
                      {r.jevNumber}
                    </Link>
                  </td>
                  <td>{new Date(r.jevDate).toLocaleDateString('en-PH')}</td>
                  <td>{r.accountingPeriod?.name ?? '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {(r.sourceType ?? '—').replace('_', ' ')}
                  </td>
                  <td>{r.particulars}</td>
                  <td className="num">{formatPeso(r.totalDebit)}</td>
                  <td className="num">{formatPeso(r.totalCredit)}</td>
                  <td>
                    <span className={`reports-badge reports-badge--${r.status}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{r.creator?.username ?? '—'}</td>
                  <td>{r.poster?.username ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>
                  Total · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                </td>
                <td className="num">{formatPeso(totalDebit)}</td>
                <td className="num">{formatPeso(totalCredit)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
