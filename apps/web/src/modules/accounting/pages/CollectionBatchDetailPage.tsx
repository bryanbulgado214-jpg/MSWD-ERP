import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AccountingApiError, finalizeCollectionBatch, getCollectionBatch } from '../api';
import type { CollectionBatchDetail } from '../types';

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

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="acct-stat">
      <div className="acct-stat__label">{label}</div>
      <div className="acct-stat__value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default function CollectionBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<CollectionBatchDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await getCollectionBatch(id));
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load batch.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function finalize() {
    if (!id) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await finalizeCollectionBatch(id);
      setNotice('Finalized — the collection JEV has been posted to the general ledger.');
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to finalize.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-error">{error}</div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <p>Loading…</p>
      </div>
    );
  }

  const { batch, entry, payments } = detail;
  const electronic =
    parseFloat(batch.onlineAmount) +
    parseFloat(batch.bankTransferAmount) +
    parseFloat(batch.otherAmount);
  const canFinalize =
    batch.status !== 'posted' &&
    !batch.jevId &&
    entry.balanced &&
    entry.unmappedTypes.length === 0 &&
    entry.totalDebit > 0;

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/accounting/collection-batches" className="acct-link">
          ← Batches
        </Link>
        <h1 style={{ margin: 0 }}>{batch.batchNumber}</h1>
        <span className={`acct-badge acct-badge--${batch.status}`}>
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
        <span style={{ color: '#667085' }}>
          {new Date(batch.collectionDate).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>

      {notice && <div className="acct-success">{notice}</div>}
      {error && <div className="acct-error">{error}</div>}

      <div className="acct-stats" style={{ marginTop: 12 }}>
        <Card label="Total Collection" value={formatPeso(batch.totalCollections)} />
        <Card label="Cash" value={formatPeso(batch.cashAmount)} />
        <Card label="Check" value={formatPeso(batch.checkAmount)} />
        <Card label="Electronic" value={formatPeso(electronic)} />
        <Card label="Receipts" value={String(batch.transactionCount)} />
        <Card label="Voided" value={String(batch.voidedReceiptCount)} />
      </div>

      <h3 className="acct-section-title">Proposed Journal Entry</h3>
      {entry.unmappedTypes.length > 0 && (
        <div className="acct-error">
          Posting blocked — {entry.unmappedTypes.length} collection type(s) have no GL account:{' '}
          {entry.unmappedTypes.map((t) => t.name).join(', ')}. Configure them under Account
          Mappings.
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="acct-table">
          <thead>
            <tr>
              <th>Account</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.chartOfAccountId}>
                <td>
                  <span className="acct-mono">{l.accountCode}</span> {l.accountName}
                </td>
                <td className="acct-mono" style={{ textAlign: 'right' }}>
                  {l.debit > 0 ? formatPeso(l.debit) : ''}
                </td>
                <td className="acct-mono" style={{ textAlign: 'right' }}>
                  {l.credit > 0 ? formatPeso(l.credit) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ textAlign: 'right' }}>
                TOTAL{' '}
                <span
                  style={{
                    marginLeft: 8,
                    color: entry.balanced ? '#067647' : '#b42318',
                  }}
                >
                  {entry.balanced ? 'BALANCED' : 'OUT OF BALANCE'}
                </span>
              </td>
              <td className="acct-mono" style={{ textAlign: 'right' }}>
                {formatPeso(entry.totalDebit)}
              </td>
              <td className="acct-mono" style={{ textAlign: 'right' }}>
                {formatPeso(entry.totalCredit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
        {batch.jevId ? (
          <Link to={`/accounting/jev/${batch.jevId}`} className="acct-btn acct-btn--primary">
            View posted JEV →
          </Link>
        ) : (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={finalize}
            disabled={busy || !canFinalize}
            title={canFinalize ? '' : 'Batch must be balanced and fully mapped to finalize.'}
          >
            {busy ? 'Posting…' : 'Finalize & Post to GL'}
          </button>
        )}
      </div>

      <h3 className="acct-section-title">Source Receipts ({payments.length})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="acct-table">
          <thead>
            <tr>
              <th>OR #</th>
              <th>Payer</th>
              <th>Method</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="acct-mono">{p.orNumber}</td>
                <td>
                  {p.consumer
                    ? `${p.consumer.accountNumber} — ${p.consumer.lastName}, ${p.consumer.firstName}`
                    : (p.payerName ?? 'Walk-in')}
                </td>
                <td>{p.paymentMethod.replace('_', ' ')}</td>
                <td className="acct-mono" style={{ textAlign: 'right' }}>
                  {formatPeso(p.totalAmount)}
                </td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
