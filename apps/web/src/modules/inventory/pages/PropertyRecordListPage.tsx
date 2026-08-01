import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPeso } from '../../budgeting/format-peso';
import { getPropertyRecords, InventoryApiError } from '../api';
import type { PropertyRecord } from '../types';
import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: PropertyRecord[] };

export default function PropertyRecordListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [conditionFilter, setConditionFilter] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const params = new URLSearchParams();
      if (conditionFilter) params.set('condition', conditionFilter);
      if (search) params.set('search', search);
      const data = await getPropertyRecords(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({ status: 'error', message: e instanceof InventoryApiError ? e.message : 'Failed to load.' });
    }
  }

  useEffect(() => { load(); }, [conditionFilter, search]);

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Property Records</h1>

      <div className="inv-toolbar">
        <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)}>
          <option value="">All Conditions</option>
          <option value="brand_new">Brand New</option>
          <option value="serviceable">Serviceable</option>
          <option value="unserviceable">Unserviceable</option>
          <option value="poor">Poor</option>
          <option value="beyond_repair">Beyond Repair</option>
        </select>
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && <div className="inv-empty">No property records found.</div>}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="inv-table">
          <thead>
            <tr>
              <th>Property #</th>
              <th>Description</th>
              <th>Classification</th>
              <th>Condition</th>
              <th style={{ textAlign: 'right' }}>Acquisition Cost</th>
              <th>Accountable</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/inventory/property-records/${p.id}`} className="inv-table__link">{p.propertyNumber}</Link></td>
                <td>{p.description}</td>
                <td><span className={`inv-badge inv-badge--${p.inventoryItem.classification}`}>{p.inventoryItem.classification.replace('_', ' ')}</span></td>
                <td><span className={`inv-badge inv-badge--${p.condition}`}>{p.condition.replace('_', ' ')}</span></td>
                <td className="inv-text-right inv-text-mono">{formatPeso(p.acquisitionCost)}</td>
                <td>{p.accountableUser?.username ?? '—'}</td>
                <td>{p.location?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
