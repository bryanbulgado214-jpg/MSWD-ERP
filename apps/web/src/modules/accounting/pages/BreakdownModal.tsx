import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { getSubsidiaryLedger } from '../api';
import type { SubsidiaryLedgerResult } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16,24,40,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};
const card: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  width: 'min(960px, 100%)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 48px rgba(16,24,40,0.28)',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: SubsidiaryLedgerResult };

export interface BreakdownTarget {
  accountId: string;
  accountCode: string;
  accountName: string;
  normalBalance?: string;
  /** Amount shown on the source line — displayed so the accountant can confirm it ties out. */
  amount?: number;
  /** How the amount was scoped: a single period, or an explicit date range. */
  periodId?: string;
  startDate?: string;
  endDate?: string;
  /** Human label of the window, e.g. "August 2026" or "Jan 1 – Aug 31, 2026". */
  windowLabel: string;
}

/**
 * A drill-down panel: given an account and the exact window behind a clicked
 * amount, it lists the posted JEV lines that constitute it (each linking to its
 * voucher) so the accountant can trace a figure and spot discrepancies. Reuses
 * the subsidiary-ledger query, scoped to the same window as the source amount.
 */
export function BreakdownModal({
  target,
  onClose,
}: {
  target: BreakdownTarget;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const params = new URLSearchParams();
    if (target.periodId) params.set('periodId', target.periodId);
    if (target.startDate) params.set('startDate', target.startDate);
    if (target.endDate) params.set('endDate', target.endDate);
    setState({ status: 'loading' });
    getSubsidiaryLedger(target.accountId, params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) =>
        setState({ status: 'error', message: err?.message ?? 'Could not load the breakdown.' }),
      );
  }, [target.accountId, target.periodId, target.startDate, target.endDate]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const normal =
    state.status === 'loaded' ? state.data.account.normalBalance : target.normalBalance;
  const entries = state.status === 'loaded' ? state.data.entries : [];

  let running = 0;
  const withBalance = entries.map((e) => {
    const debit = parseFloat(e.debitAmount);
    const credit = parseFloat(e.creditAmount);
    running += normal === 'credit' ? credit - debit : debit - credit;
    return { ...e, running };
  });
  const totalDebit = entries.reduce((s, e) => s + parseFloat(e.debitAmount), 0);
  const totalCredit = entries.reduce((s, e) => s + parseFloat(e.creditAmount), 0);

  // The subsidiary ledger page needs a window; pass through what we have.
  const ledgerQuery = new URLSearchParams();
  if (target.startDate) ledgerQuery.set('startDate', target.startDate);
  if (target.endDate) ledgerQuery.set('endDate', target.endDate);
  const ledgerHref =
    `/reports/subsidiary-ledgers/${target.accountId}` +
    (ledgerQuery.toString() ? `?${ledgerQuery.toString()}` : '');

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={card} role="dialog" aria-modal="true" aria-label="Amount breakdown">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid #eaecf0',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: 'var(--mswd-navy, #0b3a67)', fontSize: 15 }}>
              {target.accountCode} — {target.accountName}
            </div>
            <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
              Breakdown for {target.windowLabel}
              {typeof target.amount === 'number' && (
                <>
                  {' · '}
                  <span style={{ fontWeight: 600 }}>{formatPeso(target.amount)}</span>
                </>
              )}
            </div>
          </div>
          <button
            className="acct-btn acct-btn--sm"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '12px 20px', overflowY: 'auto' }}>
          {state.status === 'error' && <div className="acct-error">{state.message}</div>}
          {state.status === 'loading' && <div className="acct-empty">Loading…</div>}

          {state.status === 'loaded' && entries.length === 0 && (
            <div className="acct-empty">No posted transactions in this window.</div>
          )}

          {state.status === 'loaded' && entries.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>JEV #</th>
                    <th>Particulars</th>
                    <th>Source</th>
                    <th className="acct-text-right">Debit</th>
                    <th className="acct-text-right">Credit</th>
                    <th className="acct-text-right">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {withBalance.map((entry) => (
                    <tr key={entry.jevLineId}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(entry.jevDate).toLocaleDateString()}
                      </td>
                      <td>
                        <Link
                          to={`/accounting/jev/${entry.jevId}`}
                          className="acct-table__link"
                          onClick={onClose}
                        >
                          {entry.jevNumber}
                        </Link>
                      </td>
                      <td>{entry.particulars}</td>
                      <td>
                        <span className={`acct-badge acct-badge--${entry.sourceType}`}>
                          {entry.sourceType}
                        </span>
                      </td>
                      <td className="acct-text-right acct-text-mono">
                        {formatPeso(entry.debitAmount)}
                      </td>
                      <td className="acct-text-right acct-text-mono">
                        {formatPeso(entry.creditAmount)}
                      </td>
                      <td className="acct-text-right acct-text-mono" style={{ fontWeight: 600 }}>
                        {formatPeso(entry.running)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy, #0b3a67)' }}>
                    <td colSpan={4}>Total ({entries.length} entries)</td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(totalDebit)}</td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(totalCredit)}</td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(running)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '12px 20px',
            borderTop: '1px solid #eaecf0',
          }}
        >
          <Link
            to={ledgerHref}
            className="acct-table__link"
            onClick={onClose}
            style={{ fontSize: 13 }}
          >
            View full subsidiary ledger →
          </Link>
          <button className="acct-btn acct-btn--sm" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
