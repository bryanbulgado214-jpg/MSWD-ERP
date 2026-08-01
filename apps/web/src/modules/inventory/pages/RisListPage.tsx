import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRisList, InventoryApiError } from '../api';
import type { RisListItem } from '../types';
import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: RisListItem[] };

export default function RisListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      const params = statusFilter ? `status=${statusFilter}` : '';
      const data = await getRisList(params);
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({ status: 'error', message: e instanceof InventoryApiError ? e.message : 'Failed to load.' });
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Requisition & Issue Slips</h1>

      <div className="inv-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="partially_issued">Partially Issued</option>
          <option value="issued">Issued</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && <div className="inv-empty">No RIS found.</div>}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="inv-table">
          <thead>
            <tr>
              <th>RIS #</th>
              <th>Date</th>
              <th>Department</th>
              <th>Purpose</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Items</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/inventory/ris/${r.id}`} className="inv-table__link">{r.risNumber}</Link></td>
                <td>{new Date(r.risDate).toLocaleDateString()}</td>
                <td>{r.requestingDepartment.name}</td>
                <td>{r.purpose ?? '—'}</td>
                <td><span className={`inv-badge inv-badge--${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                <td className="inv-text-right">{r.items.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
