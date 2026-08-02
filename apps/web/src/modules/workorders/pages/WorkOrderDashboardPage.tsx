import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDashboard } from '../api';
import type { WorkOrderDashboard } from '../types';
import { WO_PRIORITY_LABELS, WO_STATUS_LABELS, WO_TYPE_LABELS } from '../types';
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../types';
import '../workorders.css';

export default function WorkOrderDashboardPage() {
  const [data, setData] = useState<WorkOrderDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="wo-loading">Loading dashboard...</p>;
  if (error) return <div className="wo-error">{error}</div>;
  if (!data) return null;

  const statusOrder: WorkOrderStatus[] = ['pending', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'];
  const totalActive = data.byStatus
    .filter((s) => !['verified', 'cancelled'].includes(s.status))
    .reduce((sum, s) => sum + s._count, 0);

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>Work Order Dashboard</h1>
        <Link to="/work-orders" className="wo-btn wo-btn--sm">View All Work Orders</Link>
      </div>

      <div className="wo-dash-cards">
        <div className="wo-dash-card wo-dash-card--active">
          <div className="wo-dash-card__value">{totalActive}</div>
          <div className="wo-dash-card__label">Active Work Orders</div>
        </div>
        {statusOrder.map((s) => {
          const item = data.byStatus.find((x) => x.status === s);
          const count = item?._count ?? 0;
          return (
            <div key={s} className={`wo-dash-card wo-dash-card--${s}`}>
              <div className="wo-dash-card__value">{count}</div>
              <div className="wo-dash-card__label">{WO_STATUS_LABELS[s]}</div>
            </div>
          );
        })}
      </div>

      <div className="wo-dash-grid">
        <section className="wo-card">
          <h2 className="wo-card__title">By Type</h2>
          {data.byType.length > 0 ? (
            <div className="wo-dash-bars">
              {data.byType.map((t) => (
                <div key={t.type} className="wo-dash-bar">
                  <span className={`wo-badge wo-badge--type-${t.type}`}>
                    {WO_TYPE_LABELS[t.type as WorkOrderType] ?? t.type}
                  </span>
                  <div className="wo-dash-bar__track">
                    <div
                      className="wo-dash-bar__fill"
                      style={{ width: `${Math.min(100, (t._count / Math.max(1, ...data.byType.map(x => x._count))) * 100)}%` }}
                    />
                  </div>
                  <span className="wo-dash-bar__count">{t._count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="wo-empty">No data</p>
          )}
        </section>

        <section className="wo-card">
          <h2 className="wo-card__title">Active by Priority</h2>
          {data.byPriority.length > 0 ? (
            <div className="wo-dash-bars">
              {data.byPriority.map((p) => (
                <div key={p.priority} className="wo-dash-bar">
                  <span className={`wo-badge wo-badge--priority-${p.priority}`}>
                    {WO_PRIORITY_LABELS[p.priority as WorkOrderPriority] ?? p.priority}
                  </span>
                  <div className="wo-dash-bar__track">
                    <div
                      className="wo-dash-bar__fill wo-dash-bar__fill--priority"
                      style={{ width: `${Math.min(100, (p._count / Math.max(1, ...data.byPriority.map(x => x._count))) * 100)}%` }}
                    />
                  </div>
                  <span className="wo-dash-bar__count">{p._count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="wo-empty">No active work orders</p>
          )}
        </section>
      </div>

      <section className="wo-card" style={{ marginTop: '1.25rem' }}>
        <h2 className="wo-card__title">Recently Completed</h2>
        {data.recentCompleted.length > 0 ? (
          <div className="wo-table-wrap">
            <table className="wo-table">
              <thead>
                <tr>
                  <th>WO #</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Materials Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCompleted.map((wo) => (
                  <tr key={wo.id}>
                    <td><Link to={`/work-orders/${wo.id}`} className="wo-link">{wo.woNumber}</Link></td>
                    <td>{wo.title}</td>
                    <td><span className={`wo-badge wo-badge--type-${wo.type}`}>{WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}</span></td>
                    <td><span className={`wo-badge wo-badge--status-${wo.status}`}>{WO_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status}</span></td>
                    <td>{wo.completedAt ? new Date(wo.completedAt).toLocaleDateString() : '—'}</td>
                    <td>{Number(wo.materialsCost).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="wo-empty">No completed work orders yet.</p>
        )}
      </section>
    </div>
  );
}
