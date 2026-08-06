import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../api';
import type { AssetDashboard, DepreciationRunStatus, AssetTransferStatus } from '../types';
import { DEPR_RUN_STATUS_LABELS, TRANSFER_STATUS_LABELS } from '../types';
import AssetSubNav from './AssetSubNav';
import '../asset.css';

function formatCurrency(val: number | string) {
  return Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function AssetDashboardPage() {
  const [data, setData] = useState<AssetDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((result) => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load dashboard'); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="am-page"><AssetSubNav /><div className="am-loading">Loading dashboard...</div></div>;
  if (error) return <div className="am-page"><AssetSubNav /><div className="am-error">{error}</div></div>;
  if (!data) return <div className="am-page"><AssetSubNav /><div className="am-error">No data available</div></div>;

  const maxCategoryCount = Math.max(...data.categoryCounts.map((c) => c.count), 1);

  return (
    <div className="am-page">
      <AssetSubNav />
      <div className="am-page__header">
        <h1>Asset Management Dashboard</h1>
      </div>

      <div className="am-dash-cards">
        <div className="am-dash-card am-dash-card--active">
          <div className="am-dash-card__value">{data.totalAssets}</div>
          <div className="am-dash-card__label">Total Active Assets</div>
        </div>
        <div className="am-dash-card">
          <div className="am-dash-card__value">{data.disposedCount}</div>
          <div className="am-dash-card__label">Disposed Assets</div>
        </div>
        <div className={`am-dash-card${data.pendingTransfers > 0 ? ' am-dash-card--warning' : ''}`}>
          <div className="am-dash-card__value">{data.pendingTransfers}</div>
          <div className="am-dash-card__label">Pending Transfers</div>
        </div>
        <div className="am-dash-card">
          <div className="am-dash-card__value">{formatCurrency(data.totalAcquisitionCost)}</div>
          <div className="am-dash-card__label">Total Acquisition Cost</div>
        </div>
        <div className="am-dash-card">
          <div className="am-dash-card__value">{formatCurrency(data.totalBookValue)}</div>
          <div className="am-dash-card__label">Total Book Value</div>
        </div>
      </div>

      <div className="am-dash-grid">
        <div className="am-card">
          <h2 className="am-card__title">Assets by Category</h2>
          {data.categoryCounts.length > 0 ? (
            <div className="am-dash-bars">
              {data.categoryCounts.map((cat) => (
                <div key={cat.id} className="am-dash-bar">
                  <span className="am-dash-bar__name">{cat.name}</span>
                  <div className="am-dash-bar__track">
                    <div
                      className="am-dash-bar__fill"
                      style={{ width: `${(cat.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                  <span className="am-dash-bar__count">{cat.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="am-empty">No categories yet.</div>
          )}
        </div>

        <div className="am-card">
          <h2 className="am-card__title">Recent Depreciation Runs</h2>
          {data.recentRuns.length > 0 ? (
            <div className="am-table-wrap">
              <table className="am-table">
                <thead>
                  <tr>
                    <th>Run #</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRuns.map((run) => (
                    <tr key={run.id} style={{ cursor: 'default' }}>
                      <td>
                        <Link to={`/assets/depreciation/${run.id}`} className="am-link">
                          {run.runNumber}
                        </Link>
                      </td>
                      <td>{MONTHS[(run.periodMonth - 1)] ?? run.periodMonth} {run.periodYear}</td>
                      <td>
                        <span className={`am-badge am-badge--status-${run.status}`}>
                          {DEPR_RUN_STATUS_LABELS[run.status as DepreciationRunStatus] ?? run.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(run.totalDepreciation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="am-empty">No depreciation runs yet.</div>
          )}
        </div>
      </div>

      <div className="am-card" style={{ marginTop: '1.25rem' }}>
        <h2 className="am-card__title">Recent Transfers</h2>
        {data.recentTransfers.length > 0 ? (
          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr>
                  <th>Transfer #</th>
                  <th>Property</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransfers.map((t) => (
                  <tr key={t.id} style={{ cursor: 'default' }}>
                    <td>
                      <Link to={`/assets/transfers/${t.id}`} className="am-link">
                        {t.transferNumber}
                      </Link>
                    </td>
                    <td>{t.propertyRecord.propertyNumber} — {t.propertyRecord.description}</td>
                    <td>{t.toUser.username}</td>
                    <td>
                      <span className={`am-badge am-badge--status-${t.status}`}>
                        {TRANSFER_STATUS_LABELS[t.status as AssetTransferStatus] ?? t.status}
                      </span>
                    </td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="am-empty">No transfers yet.</div>
        )}
      </div>
    </div>
  );
}
