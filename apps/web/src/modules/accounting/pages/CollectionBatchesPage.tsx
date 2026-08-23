import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AccountingApiError, consolidateCollectionBatch, getCollectionBatches } from '../api';
import type { CollectionBatch } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (num || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
  for_review: 'For Review',
  reviewed: 'Reviewed',
  approved: 'Approved',
  posted: 'Posted',
  rejected: 'Rejected',
  reversed: 'Reversed',
};

const TABS: Array<{ key: string; label: string }> = [
  { key: 'for_review', label: 'For Review' },
  { key: 'posted', label: 'Posted' },
  { key: '', label: 'All' },
];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: CollectionBatch[] };

export default function CollectionBatchesPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('for_review');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [date, setDate] = useState('2026-08-22');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (tab) params.set('status', tab);
      const data = await getCollectionBatches(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof AccountingApiError ? e.message : 'Failed to load batches.',
      });
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function consolidate() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const batch = await consolidateCollectionBatch(date);
      setNotice(
        `${batch.batchNumber}: ${batch.transactionCount} receipt(s), ${formatPeso(batch.totalCollections)} — ${STATUS_LABELS[batch.status]}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to consolidate.');
    } finally {
      setBusy(false);
    }
  }

  const inner = (
    <>
      <p className="acct-page__intro">
        Each day&apos;s receipts consolidate into one batch. Accounting reviews the proposed entry
        and <strong>finalizes</strong> — the system auto-posts a single summarized collection JEV to
        the general ledger.
      </p>

      <div
        className="acct-toolbar"
        style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`acct-btn${tab === t.key ? ' acct-btn--primary' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: '#475467' }}>
            Consolidate collection day
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ display: 'block', marginTop: 2 }}
            />
          </label>
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={consolidate}
            disabled={busy}
          >
            {busy ? 'Consolidating…' : 'Consolidate'}
          </button>
        </div>
      </div>

      {notice && <div className="acct-success">{notice}</div>}
      {error && <div className="acct-error">{error}</div>}

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' &&
        (state.data.length === 0 ? (
          <div className="acct-empty">No batches in this view.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="acct-table">
              <thead>
                <tr>
                  <th>Batch #</th>
                  <th>Collection Date</th>
                  <th style={{ textAlign: 'right' }}>Receipts</th>
                  <th style={{ textAlign: 'right' }}>Cash</th>
                  <th style={{ textAlign: 'right' }}>Check</th>
                  <th style={{ textAlign: 'right' }}>Electronic</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                  <th>JEV</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((b) => {
                  const electronic =
                    parseFloat(b.onlineAmount) +
                    parseFloat(b.bankTransferAmount) +
                    parseFloat(b.otherAmount);
                  return (
                    <tr
                      key={b.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/accounting/collection-batches/${b.id}`)}
                    >
                      <td className="acct-mono">{b.batchNumber}</td>
                      <td>{new Date(b.collectionDate).toLocaleDateString('en-PH')}</td>
                      <td style={{ textAlign: 'right' }}>{b.transactionCount}</td>
                      <td className="acct-mono" style={{ textAlign: 'right' }}>
                        {formatPeso(b.cashAmount)}
                      </td>
                      <td className="acct-mono" style={{ textAlign: 'right' }}>
                        {formatPeso(b.checkAmount)}
                      </td>
                      <td className="acct-mono" style={{ textAlign: 'right' }}>
                        {formatPeso(electronic)}
                      </td>
                      <td className="acct-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPeso(b.totalCollections)}
                      </td>
                      <td>
                        <span className={`acct-badge acct-badge--${b.status}`}>
                          {STATUS_LABELS[b.status] ?? b.status}
                        </span>
                      </td>
                      <td>{b.jevId ? '✓ posted' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
  if (embedded) return inner;
  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Daily Collection Batches</h1>
      {inner}
    </div>
  );
}
