import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  cancelCaf,
  certifyCaf,
  getCaf,
  ProcurementApiError,
  rejectCaf,
  submitCafForCertification,
} from '../api';
import type { Caf, CafStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Caf };

const STATUS_LABELS: Record<CafStatus, string> = {
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
};

export function CafDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  function load() {
    if (!id) return;
    setState({ status: 'loading' });
    getCaf(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) => setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load CAF.' }));
  }

  useEffect(() => { load(); }, [id]);

  async function doAction(action: (id: string, ver: number, remarks?: string) => Promise<Caf>, label: string) {
    if (state.status !== 'loaded') return;
    if (!confirm(`Are you sure you want to ${label} this CAF?`)) return;
    setActing(true);
    setError('');
    try {
      const updated = await action(state.data.id, state.data.version);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : `${label} failed.`);
    } finally {
      setActing(false);
    }
  }

  if (state.status === 'loading') return <div className="pr-page"><div className="pr-empty">Loading CAF...</div></div>;
  if (state.status === 'error') return <div className="pr-page"><div className="pr-error">{state.message}</div></div>;

  const caf = state.data;
  const canCreate = hasPermission('procurement.caf.create');
  const canCertify = hasPermission('procurement.caf.certify');
  const canCancel = hasPermission('procurement.caf.cancel');

  return (
    <div className="pr-page">
      <Link to="/procurement/cafs" className="pr-back">&larr; Back to CAFs</Link>

      <div className="pr-detail-header">
        <h1>{caf.cafNumber}</h1>
        <span className={`pr-badge pr-badge--${caf.status}`}>
          {STATUS_LABELS[caf.status] ?? caf.status}
        </span>
      </div>

      {error && <div className="pr-error">{error}</div>}

      <div className="pr-detail-actions">
        {caf.status === 'draft' && canCreate && (
          <button className="pr-btn pr-btn--primary" disabled={acting}
            onClick={() => doAction(submitCafForCertification, 'submit')}>
            Submit for Certification
          </button>
        )}
        {caf.status === 'for_certification' && canCertify && (
          <>
            <button className="pr-btn pr-btn--success" disabled={acting}
              onClick={() => doAction(certifyCaf, 'certify')}>
              Certify
            </button>
            <button className="pr-btn pr-btn--danger" disabled={acting}
              onClick={() => doAction(rejectCaf, 'reject')}>
              Reject
            </button>
          </>
        )}
        {caf.status !== 'cancelled' && caf.status !== 'rejected' && canCancel && (
          <button className="pr-btn pr-btn--danger" disabled={acting}
            onClick={() => doAction(cancelCaf, 'cancel')}>
            Cancel CAF
          </button>
        )}
      </div>

      <dl className="pr-detail-meta">
        <div>
          <dt>Purchase Request</dt>
          <dd>
            <Link to={`/procurement/purchase-requests/${caf.purchaseRequest.id}`} className="pr-table__link">
              {caf.purchaseRequest.prNumber}
            </Link>
            {' — '}{caf.purchaseRequest.title}
          </dd>
        </div>
        {caf.purchaseOrder && (
          <div>
            <dt>Purchase Order</dt>
            <dd>{caf.purchaseOrder.poNumber}</dd>
          </div>
        )}
        <div>
          <dt>Certified Amount</dt>
          <dd>{formatPeso(caf.certifiedAmount)}</dd>
        </div>
        <div>
          <dt>Budget Release</dt>
          <dd>{caf.budgetRelease.releaseNumber}</dd>
        </div>
        <div>
          <dt>Available Before</dt>
          <dd>{formatPeso(caf.availableBefore)}</dd>
        </div>
        <div>
          <dt>Available After</dt>
          <dd>{formatPeso(caf.availableAfter)}</dd>
        </div>
        <div>
          <dt>Fiscal Year</dt>
          <dd>{caf.fiscalYear.name}</dd>
        </div>
        <div>
          <dt>Fund Source</dt>
          <dd>{caf.fundSource.code} — {caf.fundSource.name}</dd>
        </div>
        <div>
          <dt>Responsibility Center</dt>
          <dd>{caf.responsibilityCenter.code} — {caf.responsibilityCenter.name}</dd>
        </div>
        {caf.accountCode && (
          <div>
            <dt>Account Code</dt>
            <dd>{caf.accountCode}</dd>
          </div>
        )}
        {caf.budgetLine && (
          <div>
            <dt>Budget Line</dt>
            <dd>{caf.budgetLine.accountCode}{caf.budgetLine.description ? ` — ${caf.budgetLine.description}` : ''}</dd>
          </div>
        )}
        {caf.purchaseOrder?.supplier && (
          <div>
            <dt>Supplier</dt>
            <dd>{caf.purchaseOrder.supplier.name}</dd>
          </div>
        )}
        {caf.purchaseRequest.department && (
          <div>
            <dt>Department</dt>
            <dd>{caf.purchaseRequest.department.code} — {caf.purchaseRequest.department.name}</dd>
          </div>
        )}
      </dl>

      <div className="pr-audit-trail">
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Audit Trail</h3>
        <div className="pr-audit-trail__entries">
          {caf.creator && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Created by</span>
              <span className="pr-audit-entry__user">{caf.creator.username}</span>
              <span className="pr-audit-entry__date">{new Date(caf.createdAt).toLocaleString()}</span>
            </div>
          )}
          {caf.certifier && caf.certifiedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Certified by</span>
              <span className="pr-audit-entry__user">{caf.certifier.username}</span>
              <span className="pr-audit-entry__date">{new Date(caf.certifiedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {caf.remarks && (
        <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#667085', textTransform: 'uppercase' }}>Remarks</h3>
          <p style={{ margin: 0, fontSize: 14 }}>{caf.remarks}</p>
        </div>
      )}
    </div>
  );
}
