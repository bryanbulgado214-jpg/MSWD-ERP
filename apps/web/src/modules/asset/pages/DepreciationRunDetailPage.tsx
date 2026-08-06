import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDepreciationRun, postDepreciationRun, voidDepreciationRun } from '../api';
import type { DepreciationRun, DepreciationRunStatus } from '../types';
import { DEPR_RUN_STATUS_LABELS } from '../types';
import AssetSubNav from './AssetSubNav';
import '../asset.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatCurrency(val: string | number) {
  return Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function DepreciationRunDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [run, setRun] = useState<DepreciationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getDepreciationRun(id)
      .then(setRun)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function doAction(action: () => Promise<DepreciationRun>) {
    setActing(true);
    setActionError('');
    try {
      const updated = await action();
      setRun(updated);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="am-page"><AssetSubNav /><div className="am-loading">Loading...</div></div>;
  if (error) return <div className="am-page"><AssetSubNav /><div className="am-error">{error}</div></div>;
  if (!run) return <div className="am-page"><AssetSubNav /><div className="am-error">Run not found</div></div>;

  const status = run.status as DepreciationRunStatus;

  return (
    <div className="am-page">
      <AssetSubNav />

      <div className="am-page__header">
        <div>
          <Link to="/assets/depreciation" className="am-btn am-btn--sm" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
            &larr; Back to Runs
          </Link>
          <h1 style={{ margin: 0 }}>
            {run.runNumber}
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <span className={`am-badge am-badge--status-${run.status}`}>
              {DEPR_RUN_STATUS_LABELS[status] ?? run.status}
            </span>
            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
              {MONTHS[(run.periodMonth - 1)] ?? run.periodMonth} {run.periodYear}
            </span>
          </div>
        </div>
        <div className="am-page__actions">
          {status === 'draft' && (
            <button
              type="button"
              className="am-btn am-btn--success"
              disabled={acting}
              onClick={() => doAction(() => postDepreciationRun(run.id, run.version))}
            >
              {acting ? 'Posting...' : 'Post'}
            </button>
          )}
          {status === 'posted' && (
            <button
              type="button"
              className="am-btn am-btn--danger"
              disabled={acting}
              onClick={() => doAction(() => voidDepreciationRun(run.id, run.version))}
            >
              {acting ? 'Voiding...' : 'Void'}
            </button>
          )}
        </div>
      </div>

      {actionError && <div className="am-error">{actionError}</div>}

      <div className="am-detail">
        <div className="am-detail__main">
          <section className="am-card">
            <h2 className="am-card__title">Run Details</h2>
            <div className="am-detail__grid">
              <div className="am-detail__field">
                <span className="am-detail__label">Total Depreciation</span>
                <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{formatCurrency(run.totalDepreciation)}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Asset Count</span>
                <span>{run.assetCount}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Created</span>
                <span>{new Date(run.createdAt).toLocaleString()}</span>
              </div>
              <div className="am-detail__field">
                <span className="am-detail__label">Created By</span>
                <span>{run.creator?.username ?? '—'}</span>
              </div>
              {run.postedAt && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Posted At</span>
                  <span>{new Date(run.postedAt).toLocaleString()}</span>
                </div>
              )}
              {run.poster && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Posted By</span>
                  <span>{run.poster.username}</span>
                </div>
              )}
              {run.voidedAt && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Voided At</span>
                  <span>{new Date(run.voidedAt).toLocaleString()}</span>
                </div>
              )}
              {run.voider && (
                <div className="am-detail__field">
                  <span className="am-detail__label">Voided By</span>
                  <span>{run.voider.username}</span>
                </div>
              )}
              {run.jev && (
                <div className="am-detail__field">
                  <span className="am-detail__label">JEV #</span>
                  <Link to={`/accounting/jev/${run.jev.id}`} className="am-link">
                    {run.jev.jevNumber}
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section className="am-card">
            <h2 className="am-card__title">Depreciation Items</h2>
            {run.items && run.items.length > 0 ? (
              <div className="am-table-wrap">
                <table className="am-table">
                  <thead>
                    <tr>
                      <th>Property #</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Depr Amount</th>
                      <th style={{ textAlign: 'right' }}>Accum Before</th>
                      <th style={{ textAlign: 'right' }}>Accum After</th>
                      <th style={{ textAlign: 'right' }}>BV Before</th>
                      <th style={{ textAlign: 'right' }}>BV After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.items.map((item) => (
                      <tr key={item.id} style={{ cursor: 'default' }}>
                        <td>{item.propertyRecord.propertyNumber}</td>
                        <td>{item.propertyRecord.inventoryItem.description}</td>
                        <td>{item.assetCategory?.name ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.depreciationAmount)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.accumBefore)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.accumAfter)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.bookValueBefore)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.bookValueAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="am-empty">No items in this run.</div>
            )}
          </section>
        </div>

        <div className="am-detail__sidebar">
          <section className="am-card">
            <h2 className="am-card__title">Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div>
                <span className="am-detail__label">Status</span>
                <span className={`am-badge am-badge--status-${run.status}`}>
                  {DEPR_RUN_STATUS_LABELS[status] ?? run.status}
                </span>
              </div>
              <div>
                <span className="am-detail__label">Period</span>
                <span>{MONTHS[(run.periodMonth - 1)] ?? run.periodMonth} {run.periodYear}</span>
              </div>
              <div>
                <span className="am-detail__label">Assets</span>
                <span>{run.assetCount}</span>
              </div>
              <div>
                <span className="am-detail__label">Total</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(run.totalDepreciation)}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
