import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getTransfer,
  approveTransfer,
  rejectTransfer,
  completeTransfer,
} from '../api';
import type { AssetTransfer, AssetTransferStatus } from '../types';
import { TRANSFER_STATUS_LABELS } from '../types';
import AssetSubNav from './AssetSubNav';
import '../asset.css';

function formatCurrency(val: string | number | undefined) {
  if (val == null) return '—';
  return Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function AssetTransferDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [transfer, setTransfer] = useState<AssetTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getTransfer(id)
      .then(setTransfer)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function doAction(action: () => Promise<AssetTransfer>) {
    setActing(true);
    setActionError('');
    try {
      const updated = await action();
      setTransfer(updated);
      setShowReject(false);
      setRejectReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="am-page"><AssetSubNav /><div className="am-loading">Loading...</div></div>;
  if (error) return <div className="am-page"><AssetSubNav /><div className="am-error">{error}</div></div>;
  if (!transfer) return <div className="am-page"><AssetSubNav /><div className="am-error">Transfer not found</div></div>;

  const status = transfer.status as AssetTransferStatus;
  const pr = transfer.propertyRecord;

  return (
    <div className="am-page">
      <AssetSubNav />

      <div className="am-page__header">
        <div>
          <Link to="/assets/transfers" className="am-btn am-btn--sm" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
            &larr; Back to Transfers
          </Link>
          <h1 style={{ margin: 0 }}>{transfer.transferNumber}</h1>
          <div style={{ marginTop: '0.5rem' }}>
            <span className={`am-badge am-badge--status-${transfer.status}`}>
              {TRANSFER_STATUS_LABELS[status] ?? transfer.status}
            </span>
          </div>
        </div>
        <div className="am-page__actions">
          {status === 'pending' && (
            <>
              <button
                type="button"
                className="am-btn am-btn--success"
                disabled={acting}
                onClick={() => doAction(() => approveTransfer(transfer.id, transfer.version))}
              >
                {acting ? 'Approving...' : 'Approve'}
              </button>
              <button
                type="button"
                className="am-btn am-btn--danger"
                onClick={() => setShowReject(!showReject)}
                disabled={acting}
              >
                Reject
              </button>
            </>
          )}
          {status === 'approved' && (
            <button
              type="button"
              className="am-btn am-btn--primary"
              disabled={acting}
              onClick={() => doAction(() => completeTransfer(transfer.id, transfer.version))}
            >
              {acting ? 'Completing...' : 'Complete Transfer'}
            </button>
          )}
        </div>
      </div>

      {actionError && <div className="am-error">{actionError}</div>}

      {showReject && status === 'pending' && (
        <div className="am-inline-form" style={{ marginBottom: '1rem' }}>
          <label className="am-form__label">Rejection Reason</label>
          <textarea
            className="am-textarea"
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
          />
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="am-btn am-btn--danger am-btn--sm"
              disabled={acting}
              onClick={() => doAction(() => rejectTransfer(transfer.id, transfer.version, rejectReason.trim() || undefined))}
            >
              {acting ? 'Rejecting...' : 'Confirm Reject'}
            </button>
            <button type="button" className="am-btn am-btn--sm" onClick={() => setShowReject(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="am-detail">
        <div className="am-detail__main">
          <section className="am-card">
            <h2 className="am-card__title">Transfer Details</h2>
            <div className="am-detail__grid">
              <div className="am-detail__field">
                <span className="am-detail__label">Transfer Date</span>
                <span>{new Date(transfer.transferDate).toLocaleDateString()}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Created</span>
                <span>{new Date(transfer.createdAt).toLocaleString()}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Created By</span>
                <span>{transfer.creator?.username ?? '—'}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Reason</span>
                <span>{transfer.reason ?? '—'}</span>
              </div>
              {transfer.approvedAt && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Approved At</span>
                  <span>{new Date(transfer.approvedAt).toLocaleString()}</span>
                </div>
              )}
              {transfer.approver && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Approved By</span>
                  <span>{transfer.approver.username}</span>
                </div>
              )}
              {transfer.completedAt && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Completed At</span>
                  <span>{new Date(transfer.completedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </section>

          <section className="am-card">
            <h2 className="am-card__title">Property Record</h2>
            <div className="am-detail__grid">
              <div className="am-detail__field">
                <span className="am-detail__label">Property #</span>
                <span>{pr.propertyNumber}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Description</span>
                <span>{pr.description}</span>
              </div>
              {pr.inventoryItem && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Item</span>
                  <span>{pr.inventoryItem.description}</span>
                </div>
              )}
              {pr.assetCategory && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Category</span>
                  <span>{pr.assetCategory.name}</span>
                </div>
              )}
              <div className="am-detail__field">
                <span className="am-detail__label">Acquisition Cost</span>
                <span>{formatCurrency(pr.acquisitionCost)}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Book Value</span>
                <span>{formatCurrency(pr.bookValue)}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Condition</span>
                <span>{pr.condition ?? '—'}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="am-detail__sidebar">
          <section className="am-card">
            <h2 className="am-card__title">Transfer Parties</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <span className="am-detail__label">From User</span>
                <span>{transfer.fromUser?.username ?? '—'}</span>
              </div>
              <div>
                <span className="am-detail__label">To User</span>
                <span>{transfer.toUser.username}</span>
              </div>
              <div>
                <span className="am-detail__label">From Location</span>
                <span>{transfer.fromLocation?.name ?? '—'}</span>
              </div>
              <div>
                <span className="am-detail__label">To Location</span>
                <span>{transfer.toLocation?.name ?? '—'}</span>
              </div>
            </div>
          </section>

          <section className="am-card">
            <h2 className="am-card__title">Status</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div>
                <span className={`am-badge am-badge--status-${transfer.status}`}>
                  {TRANSFER_STATUS_LABELS[status] ?? transfer.status}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
