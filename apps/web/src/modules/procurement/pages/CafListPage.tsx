import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { listCafs, ProcurementApiError } from '../api';
import type { Caf, CafStatus } from '../types';
import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Caf[] };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'for_certification', label: 'For Certification' },
  { value: 'certified', label: 'Certified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<CafStatus, string> = {
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
};

export function CafListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    listCafs(statusFilter ? { status: statusFilter } : undefined)
      .then((data) => { if (!cancelled) setState({ status: 'loaded', data }); })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load CAFs.' });
      });
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Certificate of Availability of Funds (CAF)</h1>

      <div className="pr-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <div className="pr-empty">Loading CAFs...</div>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No CAFs found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="pr-table">
          <thead>
            <tr>
              <th>CAF No.</th>
              <th>PR No.</th>
              <th>PO No.</th>
              <th>Amount</th>
              <th>Budget Release</th>
              <th>Fund Source</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((caf) => (
              <tr key={caf.id}>
                <td>
                  <Link to={`/procurement/cafs/${caf.id}`} className="pr-table__link">
                    {caf.cafNumber}
                  </Link>
                </td>
                <td>
                  <Link to={`/procurement/purchase-requests/${caf.purchaseRequest.id}`} className="pr-table__link">
                    {caf.purchaseRequest.prNumber}
                  </Link>
                </td>
                <td>{caf.purchaseOrder?.poNumber ?? '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(caf.certifiedAmount)}
                </td>
                <td>{caf.budgetRelease.releaseNumber}</td>
                <td>{caf.fundSource.code}</td>
                <td>
                  <span className={`pr-badge pr-badge--${caf.status}`}>
                    {STATUS_LABELS[caf.status] ?? caf.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#667085' }}>
                  {new Date(caf.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
