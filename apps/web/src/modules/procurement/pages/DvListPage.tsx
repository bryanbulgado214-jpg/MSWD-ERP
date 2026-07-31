import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import { listDvs, ProcurementApiError } from '../api';
import type { DisbursementVoucher, DvStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DisbursementVoucher[] };

const STATUS_LABELS: Record<DvStatus, string> = {
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  for_approval: 'For Approval',
  approved: 'Approved',
  released: 'Released',
  cancelled: 'Cancelled',
};

export function DvListPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    listDvs()
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({
          status: 'error',
          message: e instanceof ProcurementApiError ? e.message : 'Failed to load disbursement vouchers.',
        }),
      );
  }, []);

  if (state.status === 'loading') return <div className="pr-page"><div className="pr-empty">Loading disbursement vouchers...</div></div>;
  if (state.status === 'error') return <div className="pr-page"><div className="pr-error">{state.message}</div></div>;

  const dvs = state.data;

  return (
    <div className="pr-page">
      <div className="pr-list-header">
        <h1>Disbursement Vouchers</h1>
        {hasPermission('procurement.dv.create') && (
          <Link to="/procurement/dvs/new" className="pr-btn pr-btn--primary" style={{ textDecoration: 'none' }}>
            + New DV
          </Link>
        )}
      </div>

      {dvs.length === 0 ? (
        <div className="pr-empty">No disbursement vouchers yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="pr-table">
            <thead>
              <tr>
                <th>DV No.</th>
                <th>ORS No.</th>
                <th>Supplier</th>
                <th>PR No.</th>
                <th style={{ textAlign: 'right' }}>Gross</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {dvs.map((dv) => (
                <tr key={dv.id}>
                  <td>
                    <Link to={`/procurement/dvs/${dv.id}`} className="pr-table__link">
                      {dv.dvNumber}
                    </Link>
                  </td>
                  <td style={{ fontSize: 12, color: '#667085' }}>{dv.ors.orsNumber}</td>
                  <td>{dv.supplier.name}</td>
                  <td>
                    <Link to={`/procurement/purchase-requests/${dv.purchaseRequest.id}`} className="pr-table__link">
                      {dv.purchaseRequest.prNumber}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatPeso(dv.grossAmount)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatPeso(dv.netAmount)}
                  </td>
                  <td style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>
                    {dv.paymentMode}
                  </td>
                  <td>
                    <span className={`pr-badge pr-badge--${dv.status}`}>
                      {STATUS_LABELS[dv.status] ?? dv.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: '#667085' }}>
                    {new Date(dv.createdAt).toLocaleDateString()}
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
