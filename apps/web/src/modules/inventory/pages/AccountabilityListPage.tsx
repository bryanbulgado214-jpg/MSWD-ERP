import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getAccountabilityRecords, InventoryApiError } from '../api';
import type { AccountabilityListItem } from '../types';

import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: AccountabilityListItem[] };

export default function AccountabilityListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const data = await getAccountabilityRecords(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof InventoryApiError ? e.message : 'Failed to load.',
      });
    }
  }

  useEffect(() => {
    load();
  }, [typeFilter, statusFilter]);

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>PAR / ICS Records</h1>

      <div className="inv-toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="par">PAR</option>
          <option value="ics">ICS</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="returned">Returned</option>
          <option value="transferred">Transferred</option>
          <option value="disposed">Disposed</option>
        </select>
      </div>

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="inv-empty">No records found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Issued To</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Items</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/inventory/accountability/${r.id}`} className="inv-table__link">
                      {r.accountabilityNumber}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`inv-badge inv-badge--${r.accountabilityType === 'par' ? 'ppe' : 'semi_expendable'}`}
                    >
                      {r.accountabilityType.toUpperCase()}
                    </span>
                  </td>
                  <td>{r.issuedTo.username}</td>
                  <td>{new Date(r.issuedDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`inv-badge inv-badge--${r.status}`}>{r.status}</span>
                  </td>
                  <td className="inv-text-right">{r.items.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
