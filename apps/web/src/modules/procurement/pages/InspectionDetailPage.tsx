import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  acceptInspection,
  getInspection,
  ProcurementApiError,
  rejectInspection,
  submitInspection,
} from '../api';
import type { InspectionReport, InspectionStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: InspectionReport };

const STATUS_LABELS: Record<InspectionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const RESULT_COLORS: Record<string, string> = {
  pending: '#667085',
  accepted: '#067647',
  rejected: '#b91c1c',
  partial: '#f59e0b',
};

export function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  function load() {
    if (!id) return;
    setState({ status: 'loading' });
    getInspection(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({
          status: 'error',
          message: e instanceof ProcurementApiError ? e.message : 'Failed to load report.',
        }),
      );
  }

  useEffect(() => {
    load();
  }, [id]);

  async function doSubmit() {
    if (state.status !== 'loaded') return;
    if (!confirm('Submit this inspection report?')) return;
    setActing(true);
    setError('');
    try {
      const updated = await submitInspection(state.data.id, state.data.version);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Submit failed.');
    } finally {
      setActing(false);
    }
  }

  async function doAccept() {
    if (state.status !== 'loaded') return;
    if (!confirm('Accept this inspection report?')) return;
    setActing(true);
    setError('');
    try {
      const updated = await acceptInspection(state.data.id, state.data.version);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Accept failed.');
    } finally {
      setActing(false);
    }
  }

  async function doReject() {
    if (state.status !== 'loaded') return;
    const remarks = window.prompt('Reason for rejection:');
    if (remarks === null) return;
    setActing(true);
    setError('');
    try {
      const updated = await rejectInspection(
        state.data.id,
        state.data.version,
        remarks || undefined,
      );
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Reject failed.');
    } finally {
      setActing(false);
    }
  }

  if (state.status === 'loading')
    return (
      <div className="pr-page">
        <div className="pr-empty">Loading inspection report...</div>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="pr-page">
        <div className="pr-error">{state.message}</div>
      </div>
    );

  const r = state.data;
  const canCreate = hasPermission('procurement.inspection.create');
  const canAccept = hasPermission('procurement.inspection.accept');

  return (
    <div className="pr-page">
      <Link to="/procurement/inspections" className="pr-back">
        &larr; Back to Inspections
      </Link>

      <div className="pr-detail-header">
        <h1>{r.reportNumber}</h1>
        <span className={`pr-badge pr-badge--${r.status}`}>
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      </div>

      {error && <div className="pr-error">{error}</div>}

      <div className="pr-detail-actions">
        {r.status === 'draft' && canCreate && (
          <button className="pr-btn pr-btn--primary" disabled={acting} onClick={doSubmit}>
            Submit Report
          </button>
        )}
        {r.status === 'submitted' && canAccept && (
          <>
            <button className="pr-btn pr-btn--success" disabled={acting} onClick={doAccept}>
              Accept
            </button>
            <button className="pr-btn pr-btn--danger" disabled={acting} onClick={doReject}>
              Reject
            </button>
          </>
        )}
      </div>

      <dl className="pr-detail-meta">
        <div>
          <dt>Report Date</dt>
          <dd>{new Date(r.reportDate).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Purchase Order</dt>
          <dd>
            <Link
              to={`/procurement/purchase-orders/${r.purchaseOrder.id}`}
              className="pr-table__link"
            >
              {r.purchaseOrder.poNumber}
            </Link>
            {' — '}
            {formatPeso(r.purchaseOrder.contractAmount)}
          </dd>
        </div>
        <div>
          <dt>Purchase Request</dt>
          <dd>
            <Link
              to={`/procurement/purchase-requests/${r.purchaseRequest.id}`}
              className="pr-table__link"
            >
              {r.purchaseRequest.prNumber}
            </Link>
            {' — '}
            {r.purchaseRequest.title}
          </dd>
        </div>
        <div>
          <dt>Supplier</dt>
          <dd>
            {r.supplier.name}
            {r.supplier.tin ? ` (TIN: ${r.supplier.tin})` : ''}
          </dd>
        </div>
        <div>
          <dt>Delivery Date</dt>
          <dd>{new Date(r.deliveryDate).toLocaleDateString()}</dd>
        </div>
        {r.deliveryNote && (
          <div>
            <dt>Delivery Note</dt>
            <dd>{r.deliveryNote}</dd>
          </div>
        )}
        {r.invoiceNumber && (
          <div>
            <dt>Invoice Number</dt>
            <dd>{r.invoiceNumber}</dd>
          </div>
        )}
        {r.invoiceDate && (
          <div>
            <dt>Invoice Date</dt>
            <dd>{new Date(r.invoiceDate).toLocaleDateString()}</dd>
          </div>
        )}
        <div>
          <dt>Overall Result</dt>
          <dd style={{ color: RESULT_COLORS[r.overallResult] ?? '#1e293b', fontWeight: 600 }}>
            {r.overallResult.toUpperCase()}
          </dd>
        </div>
      </dl>

      {/* Inspection Items */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
          Inspected Items ({r.items.length})
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="pr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Unit</th>
                <th style={{ textAlign: 'right' }}>Ordered</th>
                <th style={{ textAlign: 'right' }}>Delivered</th>
                <th style={{ textAlign: 'right' }}>Accepted</th>
                <th style={{ textAlign: 'right' }}>Rejected</th>
                <th>Result</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.itemNumber}</td>
                  <td>{item.description}</td>
                  <td>{item.unitOfMeasure ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {parseFloat(item.quantityOrdered).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {parseFloat(item.quantityDelivered).toLocaleString()}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: '#067647',
                    }}
                  >
                    {parseFloat(item.quantityAccepted).toLocaleString()}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: '#b91c1c',
                    }}
                  >
                    {parseFloat(item.quantityRejected).toLocaleString()}
                  </td>
                  <td>
                    <span className={`pr-badge pr-badge--${item.result}`}>{item.result}</span>
                  </td>
                  <td style={{ fontSize: 12, color: '#667085' }}>{item.remarks ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Findings & Recommendations */}
      {(r.findings || r.recommendations) && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {r.findings && (
            <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16 }}>
              <h3
                style={{
                  margin: '0 0 8px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#667085',
                  textTransform: 'uppercase',
                }}
              >
                Findings
              </h3>
              <p style={{ margin: 0, fontSize: 14 }}>{r.findings}</p>
            </div>
          )}
          {r.recommendations && (
            <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16 }}>
              <h3
                style={{
                  margin: '0 0 8px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#667085',
                  textTransform: 'uppercase',
                }}
              >
                Recommendations
              </h3>
              <p style={{ margin: 0, fontSize: 14 }}>{r.recommendations}</p>
            </div>
          )}
        </div>
      )}

      {/* Audit Trail */}
      <div className="pr-audit-trail" style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          Audit Trail
        </h3>
        <div className="pr-audit-trail__entries">
          {r.creator && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Created by</span>
              <span className="pr-audit-entry__user">{r.creator.username}</span>
              <span className="pr-audit-entry__date">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
          )}
          {r.inspector && r.inspectedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Inspected by</span>
              <span className="pr-audit-entry__user">{r.inspector.username}</span>
              <span className="pr-audit-entry__date">
                {new Date(r.inspectedAt).toLocaleString()}
              </span>
            </div>
          )}
          {r.accepter && r.acceptedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">
                {r.status === 'rejected' ? 'Rejected by' : 'Accepted by'}
              </span>
              <span className="pr-audit-entry__user">{r.accepter.username}</span>
              <span className="pr-audit-entry__date">
                {new Date(r.acceptedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {r.remarks && (
        <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginTop: 24 }}>
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              fontWeight: 700,
              color: '#667085',
              textTransform: 'uppercase',
            }}
          >
            Remarks
          </h3>
          <p style={{ margin: 0, fontSize: 14 }}>{r.remarks}</p>
        </div>
      )}
    </div>
  );
}
