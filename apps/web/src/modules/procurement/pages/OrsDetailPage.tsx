import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  addOrsAdjustment,
  addOrsChild,
  cancelOrs,
  certifyOrsBudget,
  certifyOrsRequesting,
  getOrs,
  ProcurementApiError,
  submitOrs,
} from '../api';
import type { Ors, OrsStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Ors };

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

const CHILD_TYPE_LABELS: Record<string, string> = {
  payable: 'Payable',
  payment: 'Payment',
  liquidation: 'Liquidation',
};

export function OrsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  // child form
  const [showChildForm, setShowChildForm] = useState(false);
  const [childType, setChildType] = useState('payable');
  const [childDate, setChildDate] = useState('');
  const [childAmount, setChildAmount] = useState('');
  const [childRef, setChildRef] = useState('');
  const [childDesc, setChildDesc] = useState('');

  // adjustment form
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjType, setAdjType] = useState('supplemental');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  function load() {
    if (!id) return;
    setState({ status: 'loading' });
    getOrs(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) => setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load ORS.' }));
  }

  useEffect(() => { load(); }, [id]);

  async function doAction(
    action: (id: string, ver: number, remarks?: string) => Promise<Ors>,
    label: string,
  ) {
    if (state.status !== 'loaded') return;
    if (!confirm(`Are you sure you want to ${label} this ORS?`)) return;
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

  async function handleAddChild(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== 'loaded') return;
    const amt = parseFloat(childAmount);
    if (!amt || amt <= 0) { setError('Amount must be positive.'); return; }
    if (!childDate) { setError('Date is required.'); return; }
    setActing(true);
    setError('');
    try {
      await addOrsChild(state.data.id, {
        childType,
        childDate,
        amount: amt,
        ...(childRef ? { referenceNumber: childRef } : {}),
        ...(childDesc ? { description: childDesc } : {}),
      });
      setShowChildForm(false);
      setChildAmount('');
      setChildRef('');
      setChildDesc('');
      load();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to add record.');
    } finally {
      setActing(false);
    }
  }

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== 'loaded') return;
    const amt = parseFloat(adjAmount);
    if (!amt) { setError('Amount is required.'); return; }
    if (!adjReason.trim()) { setError('Reason is required.'); return; }
    setActing(true);
    setError('');
    try {
      await addOrsAdjustment(state.data.id, {
        adjustmentType: adjType,
        signedAmount: adjType === 'deobligation' ? -Math.abs(amt) : Math.abs(amt),
        reason: adjReason.trim(),
      });
      setShowAdjForm(false);
      setAdjAmount('');
      setAdjReason('');
      load();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to add adjustment.');
    } finally {
      setActing(false);
    }
  }

  if (state.status === 'loading') return <div className="pr-page"><div className="pr-empty">Loading ORS...</div></div>;
  if (state.status === 'error') return <div className="pr-page"><div className="pr-error">{state.message}</div></div>;

  const ors = state.data;
  const canCreate = hasPermission('procurement.ors.create');
  const canCertifyReq = hasPermission('procurement.ors.requesting_certify');
  const canCertifyBudget = hasPermission('procurement.ors.budget_certify');
  const canAdjust = hasPermission('procurement.ors.adjust');
  const canCancel = hasPermission('procurement.ors.cancel');
  const isActive = !['cancelled', 'closed'].includes(ors.status);

  return (
    <div className="pr-page">
      <Link to="/procurement/ors" className="pr-back">&larr; Back to ORS</Link>

      <div className="pr-detail-header">
        <h1>{ors.orsNumber}</h1>
        <span className={`pr-badge pr-badge--${ors.status}`}>
          {STATUS_LABELS[ors.status] ?? ors.status}
        </span>
      </div>

      {error && <div className="pr-error">{error}</div>}

      <div className="pr-detail-actions">
        {ors.status === 'draft' && canCreate && (
          <button className="pr-btn pr-btn--primary" disabled={acting}
            onClick={() => doAction(submitOrs, 'submit')}>
            Submit for Certification
          </button>
        )}
        {ors.status === 'for_requesting_certification' && canCertifyReq && (
          <button className="pr-btn pr-btn--success" disabled={acting}
            onClick={() => doAction(certifyOrsRequesting, 'certify (requesting)')}>
            Certify (Requesting Office)
          </button>
        )}
        {ors.status === 'for_budget_certification' && canCertifyBudget && (
          <button className="pr-btn pr-btn--success" disabled={acting}
            onClick={() => doAction(certifyOrsBudget, 'certify and post obligation')}>
            Certify &amp; Post Obligation
          </button>
        )}
        {isActive && canCancel && (
          <button className="pr-btn pr-btn--danger" disabled={acting}
            onClick={() => doAction(cancelOrs, 'cancel')}>
            Cancel ORS
          </button>
        )}
      </div>

      {/* ── Summary ── */}
      <dl className="pr-detail-meta">
        <div>
          <dt>CAF</dt>
          <dd>
            <Link to={`/procurement/cafs/${ors.caf.id}`} className="pr-table__link">
              {ors.caf.cafNumber}
            </Link>
          </dd>
        </div>
        <div>
          <dt>Purchase Request</dt>
          <dd>
            <Link to={`/procurement/purchase-requests/${ors.purchaseRequest.id}`} className="pr-table__link">
              {ors.purchaseRequest.prNumber}
            </Link>
            {' — '}{ors.purchaseRequest.title}
          </dd>
        </div>
        {ors.purchaseOrder && (
          <div>
            <dt>Purchase Order</dt>
            <dd>{ors.purchaseOrder.poNumber}</dd>
          </div>
        )}
        {ors.supplier && (
          <div>
            <dt>Supplier</dt>
            <dd>{ors.supplier.name}</dd>
          </div>
        )}
        <div>
          <dt>ORS Date</dt>
          <dd>{new Date(ors.orsDate).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>Fund Source</dt>
          <dd>{ors.fundSource.code} — {ors.fundSource.name}</dd>
        </div>
        <div>
          <dt>Responsibility Center</dt>
          <dd>{ors.responsibilityCenter.code} — {ors.responsibilityCenter.name}</dd>
        </div>
        {ors.accountCode && (
          <div>
            <dt>Account Code</dt>
            <dd>{ors.accountCode}</dd>
          </div>
        )}
        {ors.obligationPostingDate && (
          <div>
            <dt>Obligation Posting</dt>
            <dd>{new Date(ors.obligationPostingDate).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>

      {/* ── Amounts ── */}
      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#166534' }}>Financial Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {[
            ['Original', ors.originalAmount],
            ['Adjustments', ors.adjustmentAmount],
            ['Adjusted', ors.adjustedAmount],
            ['Payable', ors.cumulativePayable],
            ['Paid', ors.cumulativePaid],
            ['Remaining', ors.remainingUnpaid],
            ['De-obligated', ors.deobligatedAmount],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Children (Payables / Payments) ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Disbursements &amp; Payments</h3>
          {canCreate && isActive && ['obligated', 'partially_payable', 'partially_paid'].includes(ors.status) && (
            <button className="pr-btn pr-btn--primary" style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setShowChildForm(true)}>
              + Add Record
            </button>
          )}
        </div>

        {showChildForm && (
          <form onSubmit={handleAddChild} style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 140px 1fr', gap: 12, alignItems: 'end' }}>
              <div className="pr-field">
                <label>Type</label>
                <select value={childType} onChange={(e) => setChildType(e.target.value)}>
                  <option value="payable">Payable</option>
                  <option value="payment">Payment</option>
                  <option value="liquidation">Liquidation</option>
                </select>
              </div>
              <div className="pr-field">
                <label>Date</label>
                <input type="date" value={childDate} onChange={(e) => setChildDate(e.target.value)} />
              </div>
              <div className="pr-field">
                <label>Amount</label>
                <input type="number" step="0.01" min="0" value={childAmount} onChange={(e) => setChildAmount(e.target.value)} />
              </div>
              <div className="pr-field">
                <label>Reference No.</label>
                <input value={childRef} onChange={(e) => setChildRef(e.target.value)} />
              </div>
            </div>
            <div className="pr-field" style={{ marginTop: 12 }}>
              <label>Description</label>
              <input value={childDesc} onChange={(e) => setChildDesc(e.target.value)} />
            </div>
            <div className="pr-form-actions" style={{ marginTop: 12 }}>
              <button type="button" className="pr-btn" onClick={() => setShowChildForm(false)}>Cancel</button>
              <button type="submit" className="pr-btn pr-btn--primary" disabled={acting}>Add</button>
            </div>
          </form>
        )}

        {ors.children.length === 0 ? (
          <div className="pr-empty" style={{ padding: 24 }}>No disbursement or payment records yet.</div>
        ) : (
          <table className="pr-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ors.children.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`pr-badge pr-badge--${c.childType === 'payment' ? 'approved' : 'submitted'}`}>
                      {CHILD_TYPE_LABELS[c.childType] ?? c.childType}
                    </span>
                  </td>
                  <td>{c.referenceNumber ?? '—'}</td>
                  <td>{new Date(c.childDate).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(c.amount)}</td>
                  <td>
                    <span className={`pr-badge pr-badge--${c.status}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Adjustments ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Adjustments</h3>
          {canAdjust && isActive && ['obligated', 'partially_payable', 'partially_paid', 'adjusted'].includes(ors.status) && (
            <button className="pr-btn" style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setShowAdjForm(true)}>
              + Add Adjustment
            </button>
          )}
        </div>

        {showAdjForm && (
          <form onSubmit={handleAddAdjustment} style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 1fr', gap: 12, alignItems: 'end' }}>
              <div className="pr-field">
                <label>Type</label>
                <select value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                  <option value="supplemental">Supplemental</option>
                  <option value="deobligation">De-obligation</option>
                  <option value="realignment">Realignment</option>
                </select>
              </div>
              <div className="pr-field">
                <label>Amount</label>
                <input type="number" step="0.01" min="0" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
              </div>
              <div className="pr-field">
                <label>Reason *</label>
                <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
              </div>
            </div>
            <div className="pr-form-actions" style={{ marginTop: 12 }}>
              <button type="button" className="pr-btn" onClick={() => setShowAdjForm(false)}>Cancel</button>
              <button type="submit" className="pr-btn pr-btn--primary" disabled={acting}>Add Adjustment</button>
            </div>
          </form>
        )}

        {ors.adjustments.length === 0 ? (
          <div className="pr-empty" style={{ padding: 24 }}>No adjustments.</div>
        ) : (
          <table className="pr-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {ors.adjustments.map((a) => (
                <tr key={a.id}>
                  <td style={{ textTransform: 'capitalize' }}>{a.adjustmentType}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: parseFloat(a.signedAmount) < 0 ? '#b42318' : '#067647' }}>
                    {formatPeso(a.signedAmount)}
                  </td>
                  <td>{a.reason}</td>
                  <td>
                    <span className={`pr-badge pr-badge--${a.status}`}>{a.status}</span>
                  </td>
                  <td style={{ fontSize: 12, color: '#667085' }}>
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Audit Trail ── */}
      <div className="pr-audit-trail">
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Audit Trail</h3>
        <div className="pr-audit-trail__entries">
          {ors.creator && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Created by</span>
              <span className="pr-audit-entry__user">{ors.creator.username}</span>
              <span className="pr-audit-entry__date">{new Date(ors.createdAt).toLocaleString()}</span>
            </div>
          )}
          {ors.requestingOfficeCertifier && ors.requestingOfficeCertifiedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Requesting Office</span>
              <span className="pr-audit-entry__user">{ors.requestingOfficeCertifier.username}</span>
              <span className="pr-audit-entry__date">{new Date(ors.requestingOfficeCertifiedAt).toLocaleString()}</span>
            </div>
          )}
          {ors.budgetCertifier && ors.budgetCertifiedAt && (
            <div className="pr-audit-entry">
              <span className="pr-audit-entry__role">Budget Certified</span>
              <span className="pr-audit-entry__user">{ors.budgetCertifier.username}</span>
              <span className="pr-audit-entry__date">{new Date(ors.budgetCertifiedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {ors.remarks && (
        <div style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginTop: 24 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#667085', textTransform: 'uppercase' }}>Remarks</h3>
          <p style={{ margin: 0, fontSize: 14 }}>{ors.remarks}</p>
        </div>
      )}
    </div>
  );
}
