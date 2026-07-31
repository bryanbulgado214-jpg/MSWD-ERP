import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { listPurchaseOrders, ProcurementApiError } from '../api';
import type { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: PurchaseOrder[] };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_caf', label: 'Pending CAF' },
  { value: 'for_approval', label: 'For Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  pending_caf: 'Pending CAF',
  for_approval: 'For Approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export function PurchaseOrderListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    listPurchaseOrders(statusFilter ? { status: statusFilter } : undefined)
      .then((data) => { if (!cancelled) setState({ status: 'loaded', data }); })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load Purchase Orders.' });
      });
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Purchase Orders</h1>

      <div className="pr-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <div className="pr-empty">Loading purchase orders...</div>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No purchase orders found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="pr-table">
          <thead>
            <tr>
              <th>PO No.</th>
              <th>PR No.</th>
              <th>Supplier</th>
              <th>Contract Amount</th>
              <th>Status</th>
              <th>PO Date</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((po) => (
              <tr key={po.id}>
                <td>
                  <Link to={`/procurement/purchase-orders/${po.id}`} className="pr-table__link">
                    {po.poNumber}
                  </Link>
                </td>
                <td>
                  <Link to={`/procurement/purchase-requests/${po.purchaseRequest.id}`} className="pr-table__link">
                    {po.purchaseRequest.prNumber}
                  </Link>
                </td>
                <td>{po.supplier.name}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(po.contractAmount)}
                </td>
                <td>
                  <span className={`pr-badge pr-badge--${po.status}`}>
                    {STATUS_LABELS[po.status] ?? po.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#667085' }}>
                  {new Date(po.poDate).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
