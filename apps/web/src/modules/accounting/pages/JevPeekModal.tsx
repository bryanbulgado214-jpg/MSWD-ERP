import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { getJev } from '../api';
import type { JevDetail } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

// Layered above the breakdown modal (z-index 1000), so it floats over it.
const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16,24,40,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1100,
};
const card: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  width: 'min(880px, 100%)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 24px 56px rgba(16,24,40,0.32)',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JevDetail };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          color: '#98a2b3',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#1e293b' }}>{children}</div>
    </div>
  );
}

/**
 * A floating peek at a single voucher, opened from the breakdown modal so the
 * accountant can inspect the JEV that a posting belongs to without leaving the
 * drill-down. Closing returns to the breakdown underneath.
 */
export function JevPeekModal({ jevId, onClose }: { jevId: string; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    getJev(jevId)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) =>
        setState({ status: 'error', message: err?.message ?? 'Could not load the voucher.' }),
      );
  }, [jevId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const jev = state.status === 'loaded' ? state.data : null;

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={card} role="dialog" aria-modal="true" aria-label="Voucher detail">
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--mswd-navy, #0b3a67)', fontSize: 16 }}>
              {jev ? jev.jevNumber : 'Voucher'}
            </span>
            {jev && <span className={`acct-badge acct-badge--${jev.status}`}>{jev.status}</span>}
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

        <div style={{ padding: '14px 20px', overflowY: 'auto' }}>
          {state.status === 'error' && <div className="acct-error">{state.message}</div>}
          {state.status === 'loading' && <div className="acct-empty">Loading…</div>}

          {jev && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <Field label="Date">{new Date(jev.jevDate).toLocaleDateString()}</Field>
                <Field label="Period">{jev.accountingPeriod?.name ?? '—'}</Field>
                <Field label="Source">{jev.sourceType}</Field>
                <Field label="Created by">{jev.creator?.username ?? '—'}</Field>
                {jev.poster && (
                  <Field label="Posted by">
                    {jev.poster.username}
                    {jev.postedAt ? ` · ${new Date(jev.postedAt).toLocaleDateString()}` : ''}
                  </Field>
                )}
              </div>

              <div
                style={{
                  background: '#f8f9fc',
                  border: '1px solid #eaecf0',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                <span style={{ color: '#667085' }}>Particulars: </span>
                {jev.particulars}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="acct-table">
                  <thead>
                    <tr>
                      <th>Account Code</th>
                      <th>Account Name</th>
                      <th>Description</th>
                      <th className="acct-text-right">Debit</th>
                      <th className="acct-text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jev.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="acct-text-mono">{line.chartOfAccount.accountCode}</td>
                        <td>{line.chartOfAccount.name}</td>
                        <td style={{ color: '#667085' }}>{line.description || '—'}</td>
                        <td className="acct-text-right acct-text-mono">
                          {formatPeso(line.debitAmount)}
                        </td>
                        <td className="acct-text-right acct-text-mono">
                          {formatPeso(line.creditAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy, #0b3a67)' }}
                    >
                      <td colSpan={3}>Totals</td>
                      <td className="acct-text-right acct-text-mono">
                        {formatPeso(jev.totalDebit)}
                      </td>
                      <td className="acct-text-right acct-text-mono">
                        {formatPeso(jev.totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
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
          {jev ? (
            <Link
              to={`/accounting/jev/${jev.id}`}
              className="acct-table__link"
              style={{ fontSize: 13 }}
            >
              Open full voucher page ↗
            </Link>
          ) : (
            <span />
          )}
          <button className="acct-btn acct-btn--sm" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
