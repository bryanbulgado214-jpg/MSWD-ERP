import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  approveCollectionBatch,
  getCollectionBatch,
  postCollectionBatch,
  recordCollectionDeposit,
  rejectCollectionBatch,
  reverseCollectionBatch,
  reviewCollectionBatch,
} from '../api';
import type { CollectionBatchDetail } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function fmtWhen(v: string | null) {
  return v ? new Date(v).toLocaleString('en-PH') : '—';
}

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
  const { hasPermission } = useAuth();
  const [detail, setDetail] = useState<CollectionBatchDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [depDate, setDepDate] = useState('2026-08-23');
  const [depAmount, setDepAmount] = useState('');
  const [depSlip, setDepSlip] = useState('');

  const canReview = hasPermission('collections.accounting.review');
  const canApprove = hasPermission('collections.accounting.approve');
  const canPost = hasPermission('collections.accounting.post');
  const canReverse = hasPermission('collections.accounting.reverse');

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

  async function run(fn: () => Promise<unknown>, ok: string) {
    if (!id) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    const reason = window.prompt('Reason for rejecting this batch?');
    if (reason?.trim()) run(() => rejectCollectionBatch(id!, reason.trim()), 'Batch rejected.');
  }
  function reverse() {
    const reason = window.prompt(
      'Reason for reversing this posted batch? A reversing JEV will be posted.',
    );
    if (reason?.trim())
      run(
        () => reverseCollectionBatch(id!, reason.trim()),
        'Reversed — a reversing JEV was posted.',
      );
  }

  async function deposit() {
    if (!id) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await recordCollectionDeposit({
        collectionBatchId: id,
        depositDate: depDate,
        depositAmount: parseFloat(depAmount),
        ...(depSlip ? { depositSlipNumber: depSlip } : {}),
      });
      setNotice('Deposit recorded — Dr Cash in Bank / Cr Cash - Collecting Officer posted.');
      setDepAmount('');
      setDepSlip('');
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to record deposit.');
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
  const entryReady = entry.balanced && entry.unmappedTypes.length === 0 && entry.totalDebit > 0;

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/accounting/collections" className="acct-link">
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

      <div
        style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}
      >
        {batch.status === 'for_review' && (
          <>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              onClick={() => run(() => reviewCollectionBatch(id!), 'Marked as reviewed.')}
              disabled={busy || !canReview}
            >
              Mark Reviewed
            </button>
            {canReview && (
              <button type="button" className="acct-btn" onClick={reject} disabled={busy}>
                Reject
              </button>
            )}
          </>
        )}
        {batch.status === 'reviewed' && (
          <>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              onClick={() => run(() => approveCollectionBatch(id!), 'Approved for posting.')}
              disabled={busy || !canApprove}
            >
              Approve
            </button>
            {canReview && (
              <button type="button" className="acct-btn" onClick={reject} disabled={busy}>
                Reject
              </button>
            )}
          </>
        )}
        {batch.status === 'approved' && (
          <>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              onClick={() =>
                run(() => postCollectionBatch(id!), 'Posted — the collection JEV is in the GL.')
              }
              disabled={busy || !canPost || !entryReady}
              title={entryReady ? '' : 'Batch must be balanced and fully mapped to post.'}
            >
              {busy ? 'Posting…' : 'Post to GL'}
            </button>
            {canReview && (
              <button type="button" className="acct-btn" onClick={reject} disabled={busy}>
                Reject
              </button>
            )}
          </>
        )}
        {batch.status === 'posted' && canReverse && (
          <button
            type="button"
            className="acct-btn acct-btn--danger"
            onClick={reverse}
            disabled={busy}
          >
            Reverse Posting
          </button>
        )}
        {batch.status === 'rejected' && (
          <span style={{ color: '#b42318', fontSize: 13 }}>
            Rejected{batch.rejectedReason ? ` — ${batch.rejectedReason}` : ''}. Re-consolidate the
            day from the batches list to retry.
          </span>
        )}
        {batch.status === 'reversed' && (
          <span style={{ color: '#b54708', fontSize: 13 }}>
            Reversed{batch.remarks ? ` — ${batch.remarks}` : ''}.
          </span>
        )}
      </div>

      {detail.jevs.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          Journal entries:{' '}
          {detail.jevs.map((j, i) => (
            <span key={j.id}>
              {i > 0 && ' · '}
              <Link to={`/accounting/jev/${j.id}`} className="acct-link">
                {j.jevNumber}
              </Link>
            </span>
          ))}
        </div>
      )}

      <h3 className="acct-section-title">Approval History</h3>
      <table className="acct-table" style={{ maxWidth: 480 }}>
        <tbody>
          <tr>
            <td>Consolidated</td>
            <td>{fmtWhen(batch.preparedAt)}</td>
          </tr>
          <tr>
            <td>Reviewed</td>
            <td>{fmtWhen(batch.reviewedAt)}</td>
          </tr>
          <tr>
            <td>Approved</td>
            <td>{fmtWhen(batch.approvedAt)}</td>
          </tr>
          <tr>
            <td>Posted</td>
            <td>{fmtWhen(batch.postedAt)}</td>
          </tr>
        </tbody>
      </table>

      {detail.deposit && (
        <>
          <h3 className="acct-section-title">Bank Deposit</h3>
          <div className="acct-stats">
            <Card
              label="Physical Collectible"
              value={formatPeso(detail.deposit.physicalCollectible)}
            />
            <Card label="Deposited" value={formatPeso(detail.deposit.deposited)} />
            <Card
              label="Undeposited"
              value={formatPeso(detail.deposit.undeposited)}
              accent={detail.deposit.undeposited > 0.005 ? '#b54708' : '#067647'}
            />
            <Card
              label="Status"
              value={
                {
                  not_deposited: 'Not Deposited',
                  partially_deposited: 'Partially Deposited',
                  fully_deposited: 'Fully Deposited',
                  verified: 'Verified',
                }[detail.deposit.depositStatus] ?? detail.deposit.depositStatus
              }
            />
          </div>

          {detail.deposit.deposits.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>Deposit Date</th>
                    <th>Slip #</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>JEV</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.deposit.deposits.map((d) => (
                    <tr key={d.id}>
                      <td>{new Date(d.depositDate).toLocaleDateString('en-PH')}</td>
                      <td className="acct-mono">{d.depositSlipNumber ?? '—'}</td>
                      <td className="acct-mono" style={{ textAlign: 'right' }}>
                        {formatPeso(d.depositAmount)}
                      </td>
                      <td>
                        {d.jevId ? (
                          <Link to={`/accounting/jev/${d.jevId}`} className="acct-link">
                            View →
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canPost && detail.deposit.undeposited > 0.005 && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                marginTop: 10,
                background: '#f9fafb',
                border: '1px solid #eaecf0',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <label style={{ fontSize: 12, color: '#475467' }}>
                Deposit date
                <input
                  type="date"
                  value={depDate}
                  onChange={(e) => setDepDate(e.target.value)}
                  style={{ display: 'block', marginTop: 2 }}
                />
              </label>
              <label style={{ fontSize: 12, color: '#475467' }}>
                Amount
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder={String(detail.deposit.undeposited)}
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value)}
                  style={{ display: 'block', marginTop: 2, width: 130 }}
                />
              </label>
              <label style={{ fontSize: 12, color: '#475467' }}>
                Deposit slip #
                <input
                  value={depSlip}
                  onChange={(e) => setDepSlip(e.target.value)}
                  style={{ display: 'block', marginTop: 2 }}
                />
              </label>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                onClick={deposit}
                disabled={busy || !(parseFloat(depAmount) > 0)}
              >
                {busy ? 'Posting…' : 'Record Deposit'}
              </button>
            </div>
          )}
        </>
      )}

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
