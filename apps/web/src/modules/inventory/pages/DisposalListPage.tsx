import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPeso } from '../../budgeting/format-peso';
import { getDisposalRequests, InventoryApiError } from '../api';
import type { DisposalListItem } from '../types';
import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DisposalListItem[] };

export default function DisposalListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      const params = statusFilter ? `status=${statusFilter}` : '';
      const data = await getDisposalRequests(params);
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({ status: 'error', message: e instanceof InventoryApiError ? e.message : 'Failed to load.' });
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Disposal / WMR</h1>

      <div className="inv-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="for_appraisal">For Appraisal</option>
          <option value="appraised">Appraised</option>
          <option value="for_approval">For Approval</option>
          <option value="approved">Approved</option>
          <option value="disposed">Disposed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && <div className="inv-empty">No disposal requests found.</div>}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="inv-table">
          <thead>
            <tr>
              <th>WMR #</th>
              <th>Date</th>
              <th>Method</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Appraised Value</th>
              <th style={{ textAlign: 'right' }}>Items</th>
              <th>Requested By</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((d) => (
              <tr key={d.id}>
                <td><Link to={`/inventory/disposal/${d.id}`} className="inv-table__link">{d.requestNumber}</Link></td>
                <td>{new Date(d.requestDate).toLocaleDateString()}</td>
                <td>{d.disposalMethod?.replace(/_/g, ' ') ?? '—'}</td>
                <td><span className={`inv-badge inv-badge--${d.status}`}>{d.status.replace(/_/g, ' ')}</span></td>
                <td className="inv-text-right inv-text-mono">{d.totalAppraised ? formatPeso(d.totalAppraised) : '—'}</td>
                <td className="inv-text-right">{d.items.length}</td>
                <td>{d.requester?.username ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
