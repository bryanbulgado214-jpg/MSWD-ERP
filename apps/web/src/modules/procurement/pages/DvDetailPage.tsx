import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  approveDv,
  cancelDv,
  certifyDv,
  getDv,
  ProcurementApiError,
  releaseDv,
  submitDvForApproval,
  submitDvForCertification,
} from '../api';
import type { DisbursementVoucher, DvStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DisbursementVoucher };

const STATUS_LABELS: Record<DvStatus, string> = {
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  for_approval: 'For Approval',
  approved: 'Approved',
  released: 'Released',
  cancelled: 'Cancelled',
};

const PAYMENT_LABELS: Record<string, string> = {
  check: 'Check',
  ada: 'Advice to Debit Account (ADA)',
  others: 'Others',
};

export function DvDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  function load() {
    if (!id) return;
    setState({ status: 'loading' });
    getDv(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({
          status: 'error',
          message: e instanceof ProcurementApiError ? e.message : 'Failed to load DV.',
        }),
      );
  }

  useEffect(() => {
    load();
  }, [id]);

  async function doAction(
    action: (id: string, version: number, extra?: string) => Promise<DisbursementVoucher>,
    confirmMsg: string,
    promptMsg?: string,
  ) {
    if (state.status !== 'loaded') return;
    if (!confirm(confirmMsg)) return;
    let extra: string | undefined;
    if (promptMsg) {
      const val = window.prompt(promptMsg);
      if (val === null) return;
      extra = val || undefined;
    }
    setActing(true);
    setError('');
    try {
      const updated = await action(state.data.id, state.data.version, extra);
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Action failed.');
    } finally {
      setActing(false);
    }
  }

  async function doRelease() {
    if (state.status !== 'loaded') return;
    if (!confirm('Release this disbursement voucher?')) return;
    setActing(true);
    setError('');
    try {
      const checkNumber = window.prompt('Check number (leave blank if ADA):') ?? undefined;
      const checkDate = checkNumber
        ? (window.prompt('Check date (YYYY-MM-DD):') ?? undefined)
        : undefined;
      const bankName = checkNumber ? (window.prompt('Bank name:') ?? undefined) : undefined;
      const updated = await releaseDv(state.data.id, state.data.version, {
        ...(checkNumber ? { checkNumber } : {}),
        ...(checkDate ? { checkDate } : {}),
        ...(bankName ? { bankName } : {}),
      });
      setState({ status: 'loaded', data: updated });
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Release failed.');
    } finally {
      setActing(false);
    }
  }

  if (state.status === 'loading')
    return (
      <div className="pr-page">
        <div className="pr-empty">Loading disbursement voucher...</div>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="pr-page">
        <div className="pr-error">{state.message}</div>
      </div>
    );

  const dv = state.data;
  const canCreate = hasPermission('procurement.dv.create');
  const canCertify = hasPermission('procurement.dv.certify');
  const canApprove = hasPermission('procurement.dv.approve');
  const canRelease = hasPermission('procurement.dv.release');

  return (
    <div className="pr-page">
      <Link to="/procurement/dvs" className="pr-back">
        &larr; Back to DVs
      </Link>

      <div className="pr-detail-header">
        <h1>{dv.dvNumber}</h1>
        <span className={`pr-badge pr-badge--${dv.status}`}>
          {STATUS_LABELS[dv.status] ?? dv.status}
        </span>
      </div>

      {error && <div className="pr-error">{error}</div>}

      <div className="pr-detail-actions">
        <Link
          to={`/procurement/dvs/${dv.id}/print`}
          className="pr-btn"
          style={{ textDecoration: 'none' }}
        >
          Print DV
        </Link>
        {dv.status === 'draft' && canCreate && (
          <button
            className="pr-btn pr-btn--primary"
            disabled={acting}
            onClick={() => doAction(submitDvForCertification, 'Submit for certification?')}
          >
            Submit for Certification
          </button>
        )}
        {dv.status === 'for_certification' && canCertify && (
          <>
            <button
              className="pr-btn pr-btn--success"
              disabled={acting}
              onClick={() => doAction(certifyDv, 'Certify this DV?', 'Remarks (optional):')}
            >
              Certify
            </button>
            <button
              className="pr-btn pr-btn--primary"
              disabled={acting}
              onClick={() => doAction(submitDvForApproval, 'Submit for approval?')}
            >
              Submit for Approval
            </button>
          </>
        )}
        {dv.status === 'certified' && canCertify && (
          <button
            className="pr-btn pr-btn--primary"
            disabled={acting}
            onClick={() => doAction(submitDvForApproval, 'Submit for approval?')}
          >
            Submit for Approval
          </button>
        )}
        {dv.status === 'for_approval' && canApprove && (
          <button
            className="pr-btn pr-btn--success"
            disabled={acting}
            onClick={() => doAction(approveDv, 'Approve this DV?', 'Remarks (optional):')}
          >
            Approve
          </button>
        )}
        {dv.status === 'approved' && canRelease && (
          <button className="pr-btn pr-btn--success" disabled={acting} onClick={doRelease}>
            Release Payment
          </button>
        )}
        {dv.status !== 'released' && dv.status !== 'cancelled' && canCreate && (
          <button
            className="pr-btn pr-btn--danger"
            disabled={acting}
            onClick={() => doAction(cancelDv, 'Cancel this DV?', 'Reason for cancellation:')}
          >
            Cancel
          </button>
        )}
      </div>

      <dl className="pr-detail-meta">
        <div>
          <dt>DV Date</dt>
          <dd>{new Date(dv.dvDate).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>ORS</dt>
          <dd>
            {dv.ors ? (
              <>
                <Link to={`/procurement/ors/${dv.ors.id}`} className="pr-table__link">
                  {dv.ors.orsNumber}
                </Link>
                {' — '}
                {formatPeso(dv.ors.originalAmount)}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Purchase Order</dt>
          <dd>
            {dv.purchaseOrder ? (
              <>
                <Link
                  to={`/procurement/purchase-orders/${dv.purchaseOrder.id}`}
                  className="pr-table__link"
                >
                  {dv.purchaseOrder.poNumber}
                </Link>
                {' — '}
                {formatPeso(dv.purchaseOrder.contractAmount)}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Purchase Request</dt>
          <dd>
            {dv.purchaseRequest ? (
              <>
                <Link
                  to={`/procurement/purchase-requests/${dv.purchaseRequest.id}`}
                  className="pr-table__link"
                >
                  {dv.purchaseRequest.prNumber}
                </Link>
                {' — '}
                {dv.purchaseRequest.title}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>{dv.supplier ? 'Supplier' : 'Payee'}</dt>
          <dd>
            {dv.supplier
              ? `${dv.supplier.name}${dv.supplier.tin ? ` (TIN: ${dv.supplier.tin})` : ''}`
              : (dv.payeeName ?? '—')}
          </dd>
        </div>
        {dv.inspectionReport && (
          <div>
            <dt>Inspection Report</dt>
            <dd>
              <Link
                to={`/procurement/inspections/${dv.inspectionReport.id}`}
                className="pr-table__link"
              >
                {dv.inspectionReport.reportNumber}
              </Link>
              {' — '}
              {dv.inspectionReport.overallResult}
            </dd>
          </div>
        )}
        {dv.fundSource && (
          <div>
            <dt>Fund Source</dt>
            <dd>
              {dv.fundSource.code} — {dv.fundSource.name}
            </dd>
          </div>
        )}
        {dv.responsibilityCenter && (
          <div>
            <dt>Responsibility Center</dt>
            <dd>
              {dv.responsibilityCenter.code} — {dv.responsibilityCenter.name}
            </dd>
          </div>
        )}
        {dv.accountCode && (
          <div>
            <dt>Account Code</dt>
            <dd>{dv.accountCode}</dd>
          </div>
        )}
        <div>
          <dt>Payment Mode</dt>
          <dd>{PAYMENT_LABELS[dv.paymentMode] ?? dv.paymentMode}</dd>
        </div>
      </dl>

      {/* Particulars */}
      <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <h3
          style={{
            margin: '0 0 8px',
            fontSize: 13,
            fontWeight: 700,
            color: '#667085',
            textTransform: 'uppercase',
          }}
        >
          Particulars
        </h3>
        <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap' }}>{dv.particulars}</p>
      </div>

      {/* Financial Summary */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
          Financial Summary
        </h3>
        <table className="pr-table" style={{ maxWidth: 400 }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>Gross Amount</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatPeso(dv.grossAmount)}
              </td>
            </tr>
            <tr>
              <td style={{ color: '#b91c1c' }}>Less: Tax</td>
              <td
                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#b91c1c' }}
              >
                ({formatPeso(dv.taxAmount)})
              </td>
            </tr>
            <tr>
              <td style={{ color: '#b91c1c' }}>Less: Other Deductions</td>
              <td
                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#b91c1c' }}
              >
                ({formatPeso(dv.otherDeductions)})
              </td>
            </tr>
            <tr style={{ borderTop: '2px solid #0f172a' }}>
              <td style={{ fontWeight: 700, fontSize: 15 }}>Net Amount</td>
              <td
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#067647',
                }}
              >
                {formatPeso(dv.netAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Check Details */}
      {(dv.checkNumber || dv.bankName) && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
            Payment Details
          </h3>
          <dl className="pr-detail-meta">
            {dv.checkNumber && (
              <div>
                <dt>Check Number</dt>
                <dd>{dv.checkNumber}</dd>
              </div>
            )}
            {dv.checkDate && (
              <div>
                <dt>Check Date</dt>
                <dd>{new Date(dv.checkDate).toLocaleDateString()}</dd>
              </div>
            )}
            {dv.bankName && (
              <div>
                <dt>Bank</dt>
                <dd>{dv.bankName}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Audit Trail */}
      <div className="pr-audit-trail" style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          Audit Trail
        </h3>
        <div className="pr-audit-trail__entries">
          {dv.creator && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Created by</span>
              <span className="pr-audit-entry__user">{dv.creator.username}</span>
              <span className="pr-audit-entry__date">
                {new Date(dv.createdAt).toLocaleString()}
              </span>
            </div>
          )}
          {dv.certifier && dv.certifiedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Certified by</span>
              <span className="pr-audit-entry__user">{dv.certifier.username}</span>
              <span className="pr-audit-entry__date">
                {new Date(dv.certifiedAt).toLocaleString()}
              </span>
            </div>
          )}
          {dv.approver && dv.approvedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Approved by</span>
              <span className="pr-audit-entry__user">{dv.approver.username}</span>
              <span className="pr-audit-entry__date">
                {new Date(dv.approvedAt).toLocaleString()}
              </span>
            </div>
          )}
          {dv.releaser && dv.releasedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Released by</span>
              <span className="pr-audit-entry__user">{dv.releaser.username}</span>
              <span className="pr-audit-entry__date">
                {new Date(dv.releasedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {dv.remarks && (
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
          <p style={{ margin: 0, fontSize: 14 }}>{dv.remarks}</p>
        </div>
      )}
    </div>
  );
}
