import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrder,
  listCafs,
  ProcurementApiError,
  submitPoForCaf,
} from '../api';
import type { Caf, PurchaseOrder, PurchaseOrderStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: PurchaseOrder };

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  pending_caf: 'Pending CAF',
  for_approval: 'For Approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [linkedCAFs, setLinkedCAFs] = useState<Caf[]>([]);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  function load() {
    if (!id) return;
    setState({ status: 'loading' });
    getPurchaseOrder(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) => setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load PO.' }));
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (state.status !== 'loaded') return;
    listCafs({ purchaseOrderId: state.data.id }).then(setLinkedCAFs).catch(() => {});
  }, [state.status === 'loaded' ? state.data.id : null]);

  async function doSubmitForCaf() {
    if (state.status !== 'loaded') return;
    if (!confirm('Submit this PO for CAF certification?')) return;
    setActing(true);
    setError('');
    try {
      const updated = await submitPoForCaf(state.data.id, state.data.version);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Submit failed.');
    } finally {
      setActing(false);
    }
  }

  async function doApprove() {
    if (state.status !== 'loaded') return;
    if (!confirm('Approve this Purchase Order?')) return;
    setActing(true);
    setError('');
    try {
      const updated = await approvePurchaseOrder(state.data.id, state.data.version);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Approval failed.');
    } finally {
      setActing(false);
    }
  }

  async function doCancel() {
    if (state.status !== 'loaded') return;
    const remarks = window.prompt('Reason for cancellation:');
    if (remarks === null) return;
    setActing(true);
    setError('');
    try {
      const updated = await cancelPurchaseOrder(state.data.id, state.data.version, remarks || undefined);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Cancel failed.');
    } finally {
      setActing(false);
    }
  }

  if (state.status === 'loading') return <div className="pr-page"><div className="pr-empty">Loading PO...</div></div>;
  if (state.status === 'error') return <div className="pr-page"><div className="pr-error">{state.message}</div></div>;

  const po = state.data;
  const canCreate = hasPermission('procurement.po.create');
  const canApprove = hasPermission('procurement.po.approve');

  return (
    <div className="pr-page">
      <Link to="/procurement/purchase-orders" className="pr-back">&larr; Back to Purchase Orders</Link>

      <div className="pr-detail-header">
        <h1>{po.poNumber}</h1>
        <span className={`pr-badge pr-badge--${po.status}`}>
          {STATUS_LABELS[po.status] ?? po.status}
        </span>
      </div>

      {error && <div className="pr-error">{error}</div>}

      <div className="pr-detail-actions">
        {po.status === 'draft' && canCreate && (
          <button className="pr-btn pr-btn--primary" disabled={acting} onClick={doSubmitForCaf}>
            Submit for CAF
          </button>
        )}
        {po.status === 'for_approval' && canApprove && (
          <button className="pr-btn pr-btn--success" disabled={acting} onClick={doApprove}>
            Approve PO
          </button>
        )}
        {po.status !== 'approved' && po.status !== 'cancelled' && canCreate && (
          <button className="pr-btn pr-btn--danger" disabled={acting} onClick={doCancel}>
            Cancel PO
          </button>
        )}
      </div>

      <dl className="pr-detail-meta">
        <div>
          <dt>Purchase Request</dt>
          <dd>
            <Link to={`/procurement/purchase-requests/${po.purchaseRequest.id}`} className="pr-table__link">
              {po.purchaseRequest.prNumber}
            </Link>
            {' — '}{po.purchaseRequest.title}
          </dd>
        </div>
        <div>
          <dt>Supplier</dt>
          <dd>{po.supplier.name}</dd>
        </div>
        {po.supplier.tin && (
          <div>
            <dt>Supplier TIN</dt>
            <dd>{po.supplier.tin}</dd>
          </div>
        )}
        {po.supplier.address && (
          <div>
            <dt>Supplier Address</dt>
            <dd>{po.supplier.address}</dd>
          </div>
        )}
        <div>
          <dt>Contract Amount</dt>
          <dd style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPeso(po.contractAmount)}</dd>
        </div>
        <div>
          <dt>PO Date</dt>
          <dd>{new Date(po.poDate).toLocaleDateString()}</dd>
        </div>
        {po.awardDate && (
          <div>
            <dt>Award Date</dt>
            <dd>{new Date(po.awardDate).toLocaleDateString()}</dd>
          </div>
        )}
        {po.awardNoticeNumber && (
          <div>
            <dt>Award Notice No.</dt>
            <dd>{po.awardNoticeNumber}</dd>
          </div>
        )}
        {po.modeOfProcurement && (
          <div>
            <dt>Mode of Procurement</dt>
            <dd>{po.modeOfProcurement}</dd>
          </div>
        )}
        {po.deliveryTerms && (
          <div>
            <dt>Delivery Terms</dt>
            <dd>{po.deliveryTerms}</dd>
          </div>
        )}
        {po.paymentTerms && (
          <div>
            <dt>Payment Terms</dt>
            <dd>{po.paymentTerms}</dd>
          </div>
        )}
      </dl>

      {/* Audit Trail */}
      <div className="pr-audit-trail">
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Audit Trail</h3>
        <div className="pr-audit-trail__entries">
          {po.creator && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Created by</span>
              <span className="pr-audit-entry__user">{po.creator.username}</span>
              <span className="pr-audit-entry__date">{new Date(po.createdAt).toLocaleString()}</span>
            </div>
          )}
          {po.approver && po.approvedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Approved by</span>
              <span className="pr-audit-entry__user">{po.approver.username}</span>
              <span className="pr-audit-entry__date">{new Date(po.approvedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Linked CAFs */}
      {linkedCAFs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 12px' }}>
            Linked CAFs ({linkedCAFs.length})
          </h3>
          <table className="pr-table">
            <thead>
              <tr>
                <th>CAF Number</th>
                <th>Certified Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {linkedCAFs.map((caf) => (
                <tr key={caf.id}>
                  <td>
                    <Link to={`/procurement/cafs/${caf.id}`} className="pr-table__link">{caf.cafNumber}</Link>
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPeso(caf.certifiedAmount)}</td>
                  <td><span className={`pr-badge pr-badge--${caf.status}`}>{caf.status.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: 12, color: '#667085' }}>{new Date(caf.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {po.remarks && (
        <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginTop: 24 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#667085', textTransform: 'uppercase' }}>Remarks</h3>
          <p style={{ margin: 0, fontSize: 14 }}>{po.remarks}</p>
        </div>
      )}
    </div>
  );
}
