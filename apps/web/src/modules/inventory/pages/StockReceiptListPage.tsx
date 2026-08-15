import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { getStockReceipts, InventoryApiError } from '../api';
import type { StockReceiptListItem } from '../types';

import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: StockReceiptListItem[] };

export default function StockReceiptListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      const params = statusFilter ? `status=${statusFilter}` : '';
      const data = await getStockReceipts(params);
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
  }, [statusFilter]);

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Stock Receipts</h1>

      <div className="inv-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="inv-empty">No stock receipts found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>PO #</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Items</th>
                <th>Received By</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/inventory/stock-receipts/${r.id}`} className="inv-table__link">
                      {r.receiptNumber}
                    </Link>
                  </td>
                  <td>{new Date(r.receiptDate).toLocaleDateString()}</td>
                  <td>{r.supplier?.name ?? '—'}</td>
                  <td>{r.purchaseOrder?.poNumber ?? '—'}</td>
                  <td>
                    <span className={`inv-badge inv-badge--${r.status}`}>{r.status}</span>
                  </td>
                  <td className="inv-text-right">{r.items.length}</td>
                  <td>{r.receiver?.username ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
