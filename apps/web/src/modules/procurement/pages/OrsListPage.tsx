import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { listOrs, ProcurementApiError } from '../api';
import type { Ors, OrsStatus } from '../types';
import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Ors[] };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'for_requesting_certification', label: 'For Requesting Cert.' },
  { value: 'for_budget_certification', label: 'For Budget Cert.' },
  { value: 'obligated', label: 'Obligated' },
  { value: 'partially_payable', label: 'Partially Payable' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'fully_paid', label: 'Fully Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<OrsStatus, string> = {
  draft: 'Draft',
  for_requesting_certification: 'For Req. Cert.',
  for_budget_certification: 'For Budget Cert.',
  obligated: 'Obligated',
  partially_payable: 'Partially Payable',
  partially_paid: 'Partially Paid',
  fully_paid: 'Fully Paid',
  adjusted: 'Adjusted',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

export function OrsListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    listOrs(statusFilter ? { status: statusFilter } : undefined)
      .then((data) => { if (!cancelled) setState({ status: 'loaded', data }); })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load ORS.' });
      });
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Obligation Request and Status (ORS)</h1>

      <div className="pr-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <div className="pr-empty">Loading ORS records...</div>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No ORS records found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="pr-table">
          <thead>
            <tr>
              <th>ORS No.</th>
              <th>CAF No.</th>
              <th>PR No.</th>
              <th>Original Amt</th>
              <th>Adjusted Amt</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((ors) => (
              <tr key={ors.id}>
                <td>
                  <Link to={`/procurement/ors/${ors.id}`} className="pr-table__link">
                    {ors.orsNumber}
                  </Link>
                </td>
                <td>
                  <Link to={`/procurement/cafs/${ors.caf.id}`} className="pr-table__link">
                    {ors.caf.cafNumber}
                  </Link>
                </td>
                <td>
                  <Link to={`/procurement/purchase-requests/${ors.purchaseRequest.id}`} className="pr-table__link">
                    {ors.purchaseRequest.prNumber}
                  </Link>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(ors.originalAmount)}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(ors.adjustedAmount)}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(ors.remainingUnpaid)}
                </td>
                <td>
                  <span className={`pr-badge pr-badge--${ors.status}`}>
                    {STATUS_LABELS[ors.status] ?? ors.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#667085' }}>
                  {new Date(ors.orsDate).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
