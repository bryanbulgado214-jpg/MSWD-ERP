import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPhysicalCounts, InventoryApiError } from '../api';
import type { PhysicalCountListItem } from '../types';
import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: PhysicalCountListItem[] };

const COUNT_TYPE_LABELS: Record<string, string> = {
  semi_annual_supplies: 'Semi-Annual (Supplies)',
  annual_ppe: 'Annual (PPE)',
  annual_semi_expendable: 'Annual (Semi-Expendable)',
  spot_check: 'Spot Check',
};

export default function PhysicalCountListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      const params = statusFilter ? `status=${statusFilter}` : '';
      const data = await getPhysicalCounts(params);
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({ status: 'error', message: e instanceof InventoryApiError ? e.message : 'Failed to load.' });
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Physical Count</h1>

      <div className="inv-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="approved">Approved</option>
        </select>
      </div>

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && <div className="inv-empty">No physical counts found.</div>}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="inv-table">
          <thead>
            <tr>
              <th>Count #</th>
              <th>Date</th>
              <th>Type</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Items</th>
              <th>Counted By</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/inventory/physical-counts/${c.id}`} className="inv-table__link">{c.countNumber}</Link></td>
                <td>{new Date(c.countDate).toLocaleDateString()}</td>
                <td>{COUNT_TYPE_LABELS[c.countType] ?? c.countType}</td>
                <td><span className={`inv-badge inv-badge--${c.status}`}>{c.status.replace('_', ' ')}</span></td>
                <td className="inv-text-right">{c.items.length}</td>
                <td>{c.counter?.username ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
