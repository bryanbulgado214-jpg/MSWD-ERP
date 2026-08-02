import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getWorkOrders } from '../api';
import type { WorkOrder } from '../types';
import { WO_PRIORITY_LABELS, WO_STATUS_LABELS, WO_TYPE_LABELS } from '../types';
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../types';
import '../workorders.css';

export default function WorkOrderListPage() {
  const { permissions } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const statusFilter = searchParams.get('status') ?? '';
  const typeFilter = searchParams.get('type') ?? '';
  const searchQuery = searchParams.get('search') ?? '';

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (searchQuery) params.set('search', searchQuery);

    setLoading(true);
    getWorkOrders(params.toString())
      .then(setWorkOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, typeFilter, searchQuery]);

  const canCreate = permissions.has('workorder.create');

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>Work Orders</h1>
        {canCreate && (
          <Link to="/work-orders/new" className="wo-btn wo-btn--primary">
            + New Work Order
          </Link>
        )}
      </div>

      <div className="wo-filters">
        <input
          type="text"
          placeholder="Search WO#, title, location..."
          className="wo-input"
          value={searchQuery}
          onChange={(e) => {
            const p = new URLSearchParams(searchParams);
            if (e.target.value) p.set('search', e.target.value);
            else p.delete('search');
            setSearchParams(p);
          }}
        />
        <select
          className="wo-select"
          value={statusFilter}
          onChange={(e) => {
            const p = new URLSearchParams(searchParams);
            if (e.target.value) p.set('status', e.target.value);
            else p.delete('status');
            setSearchParams(p);
          }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="verified">Verified</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          className="wo-select"
          value={typeFilter}
          onChange={(e) => {
            const p = new URLSearchParams(searchParams);
            if (e.target.value) p.set('type', e.target.value);
            else p.delete('type');
            setSearchParams(p);
          }}
        >
          <option value="">All Types</option>
          <option value="installation">Installation</option>
          <option value="repair">Repair</option>
          <option value="replacement">Replacement</option>
          <option value="disconnection">Disconnection</option>
          <option value="reconnection">Reconnection</option>
          <option value="inspection">Inspection</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      {error && <div className="wo-error">{error}</div>}

      {loading ? (
        <p className="wo-loading">Loading work orders...</p>
      ) : workOrders.length === 0 ? (
        <p className="wo-empty">No work orders found.</p>
      ) : (
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
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.id}>
                  <td>
                    <Link to={`/work-orders/${wo.id}`} className="wo-link">
                      {wo.woNumber}
                    </Link>
                  </td>
                  <td>{wo.title}</td>
                  <td>
                    <span className={`wo-badge wo-badge--type-${wo.type}`}>
                      {WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}
                    </span>
                  </td>
                  <td>
                    <span className={`wo-badge wo-badge--priority-${wo.priority}`}>
                      {WO_PRIORITY_LABELS[wo.priority as WorkOrderPriority] ?? wo.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`wo-badge wo-badge--status-${wo.status}`}>
                      {WO_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status}
                    </span>
                  </td>
                  <td>
                    {wo.consumer
                      ? `${wo.consumer.firstName} ${wo.consumer.lastName}`
                      : '—'}
                  </td>
                  <td>
                    {wo.assignee
                      ? `${wo.assignee.firstName} ${wo.assignee.lastName}`
                      : '—'}
                  </td>
                  <td>
                    {wo.scheduledDate
                      ? new Date(wo.scheduledDate).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
