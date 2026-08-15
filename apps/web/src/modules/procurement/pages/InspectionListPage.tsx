import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { listInspections, ProcurementApiError } from '../api';
import type { InspectionReport, InspectionStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: InspectionReport[] };

const STATUS_LABELS: Record<InspectionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function InspectionListPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    listInspections()
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({
          status: 'error',
          message: e instanceof ProcurementApiError ? e.message : 'Failed to load inspections.',
        }),
      );
  }, []);

  if (state.status === 'loading')
    return (
      <div className="pr-page">
        <div className="pr-empty">Loading inspections...</div>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="pr-page">
        <div className="pr-error">{state.message}</div>
      </div>
    );

  const reports = state.data;

  return (
    <div className="pr-page">
      <div className="pr-list-header">
        <h1>Inspection Reports</h1>
        {hasPermission('procurement.inspection.create') && (
          <Link
            to="/procurement/inspections/new"
            className="pr-btn pr-btn--primary"
            style={{ textDecoration: 'none' }}
          >
            + New Inspection
          </Link>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="pr-empty">No inspection reports yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="pr-table">
            <thead>
              <tr>
                <th>Report No.</th>
                <th>PO No.</th>
                <th>Supplier</th>
                <th>PR No.</th>
                <th>Delivery Date</th>
                <th>Result</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/procurement/inspections/${r.id}`} className="pr-table__link">
                      {r.reportNumber}
                    </Link>
                  </td>
                  <td>
                    <Link
                      to={`/procurement/purchase-orders/${r.purchaseOrder.id}`}
                      className="pr-table__link"
                    >
                      {r.purchaseOrder.poNumber}
                    </Link>
                  </td>
                  <td>{r.supplier.name}</td>
                  <td>
                    <Link
                      to={`/procurement/purchase-requests/${r.purchaseRequest.id}`}
                      className="pr-table__link"
                    >
                      {r.purchaseRequest.prNumber}
                    </Link>
                  </td>
                  <td style={{ fontSize: 12, color: '#667085' }}>
                    {new Date(r.deliveryDate).toLocaleDateString()}
                  </td>
                  <td>
                    <span className={`pr-badge pr-badge--${r.overallResult}`}>
                      {r.overallResult}
                    </span>
                  </td>
                  <td>
                    <span className={`pr-badge pr-badge--${r.status}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#667085' }}>
                    {new Date(r.createdAt).toLocaleDateString()}
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
