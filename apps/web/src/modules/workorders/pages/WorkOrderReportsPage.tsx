import { useState } from 'react';

import { getReport } from '../api';
import { WO_PRIORITY_LABELS, WO_STATUS_LABELS, WO_TYPE_LABELS } from '../types';
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../types';
import '../workorders.css';

interface ReportOrder {
  id: string; woNumber: string; title: string; type: string; priority: string; status: string;
  location: string | null; scheduledDate: string | null; completedAt: string | null;
  estimatedDurationHrs: string | null; actualDurationHrs: string | null; materialsCost: string;
  createdAt: string;
  consumer: { firstName: string; lastName: string; accountNumber: string } | null;
  assignee: { firstName: string; lastName: string } | null;
}

export default function WorkOrderReportsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [summary, setSummary] = useState<{ totalCount: number; totalMaterialsCost: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const result = await getReport(params.toString());
      setOrders(result.orders);
      setSummary(result.summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>Work Order Reports</h1>
      </div>

      <div className="wo-card" style={{ marginBottom: '1.25rem' }}>
        <h2 className="wo-card__title">Filters</h2>
        <div className="wo-form__grid" style={{ maxWidth: '800px' }}>
          <label className="wo-form__field">
            <span className="wo-form__label">Date From</span>
            <input type="date" className="wo-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Date To</span>
            <input type="date" className="wo-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Status</span>
            <select className="wo-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="verified">Verified</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Type</span>
            <select className="wo-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              <option value="installation">Installation</option>
              <option value="repair">Repair</option>
              <option value="replacement">Replacement</option>
              <option value="disconnection">Disconnection</option>
              <option value="reconnection">Reconnection</option>
              <option value="inspection">Inspection</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="wo-btn wo-btn--primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && <div className="wo-error">{error}</div>}

      {summary && (
        <>
          <div className="wo-dash-cards" style={{ marginBottom: '1.25rem' }}>
            <div className="wo-dash-card">
              <div className="wo-dash-card__value">{summary.totalCount}</div>
              <div className="wo-dash-card__label">Total Work Orders</div>
            </div>
            <div className="wo-dash-card">
              <div className="wo-dash-card__value">
                {Number(summary.totalMaterialsCost).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
              </div>
              <div className="wo-dash-card__label">Total Materials Cost</div>
            </div>
          </div>

          <div className="wo-card">
            <h2 className="wo-card__title">Results ({orders.length})</h2>
            {orders.length > 0 ? (
              <div className="wo-table-wrap">
                <table className="wo-table">
                  <thead>
                    <tr>
                      <th>WO #</th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Consumer</th>
                      <th>Assigned To</th>
                      <th>Created</th>
                      <th>Completed</th>
                      <th>Duration</th>
                      <th>Materials</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((wo) => (
                      <tr key={wo.id}>
                        <td>{wo.woNumber}</td>
                        <td>{wo.title}</td>
                        <td><span className={`wo-badge wo-badge--type-${wo.type}`}>{WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}</span></td>
                        <td><span className={`wo-badge wo-badge--priority-${wo.priority}`}>{WO_PRIORITY_LABELS[wo.priority as WorkOrderPriority] ?? wo.priority}</span></td>
                        <td><span className={`wo-badge wo-badge--status-${wo.status}`}>{WO_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status}</span></td>
                        <td>{wo.consumer ? `${wo.consumer.firstName} ${wo.consumer.lastName}` : '—'}</td>
                        <td>{wo.assignee ? `${wo.assignee.firstName} ${wo.assignee.lastName}` : '—'}</td>
                        <td>{new Date(wo.createdAt).toLocaleDateString()}</td>
                        <td>{wo.completedAt ? new Date(wo.completedAt).toLocaleDateString() : '—'}</td>
                        <td>
                          {wo.actualDurationHrs
                            ? `${Number(wo.actualDurationHrs)}h`
                            : wo.estimatedDurationHrs
                              ? `~${Number(wo.estimatedDurationHrs)}h`
                              : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {Number(wo.materialsCost) > 0
                            ? Number(wo.materialsCost).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="wo-empty">No work orders match the selected filters.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
