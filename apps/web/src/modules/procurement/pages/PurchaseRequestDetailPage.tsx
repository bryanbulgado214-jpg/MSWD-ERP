import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  acceptForProcurement,
  budgetCertifyPurchaseRequest,
  cancelPurchaseRequest,
  endorsePurchaseRequest,
  finalApprovePurchaseRequest,
  getPurchaseRequest,
  inspectPr,
  listCafs,
  listOrs,
  listPurchaseOrders,
  markPrLifecycle,
  ProcurementApiError,
  rejectPurchaseRequest,
  returnPurchaseRequest,
  submitPurchaseRequest,
} from '../api';
import type { Caf, Ors, PurchaseOrder, PurchaseRequest, PurchaseRequestStatus } from '../types';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: PurchaseRequest };

const WORKFLOW_STEPS: { status: PurchaseRequestStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'submitted', label: 'Submitted' },
  { status: 'endorsed', label: 'Endorsed' },
  { status: 'budget_certified', label: 'Budget Cert.' },
  { status: 'approved', label: 'Approved' },
  { status: 'procurement_in_progress', label: 'Procurement' },
  { status: 'awarded', label: 'Awarded' },
  { status: 'po_issued', label: 'PO Issued' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'inspected', label: 'Inspected' },
  { status: 'completed', label: 'Completed' },
];

const TERMINAL_STATUSES = new Set<PurchaseRequestStatus>(['rejected', 'cancelled', 'returned', 'voided']);

function stepIndex(status: PurchaseRequestStatus): number {
  const idx = WORKFLOW_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : -1;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  endorsed: 'Endorsed',
  budget_review: 'Budget Review',
  budget_certified: 'Budget Certified',
  approved: 'Approved',
  procurement_review: 'Procurement Review',
  accepted_for_procurement: 'Accepted for Procurement',
  procurement_in_progress: 'Procurement In Progress',
  awarded: 'Awarded',
  po_issued: 'PO Issued',
  delivered: 'Delivered',
  inspected: 'Inspected',
  completed: 'Completed',
  returned: 'Returned',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  voided: 'Voided',
};

export function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [linkedPOs, setLinkedPOs] = useState<PurchaseOrder[]>([]);
  const [linkedCAFs, setLinkedCAFs] = useState<Caf[]>([]);
  const [linkedORS, setLinkedORS] = useState<Ors[]>([]);

  function load() {
    if (!id) return;
    setState({ status: 'loading' });
    getPurchaseRequest(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err instanceof ProcurementApiError ? err.message : 'Failed to load.' }));
  }

  useEffect(load, [id]);

  useEffect(() => {
    if (state.status !== 'loaded') return;
    const prId = state.data.id;
    listPurchaseOrders({ purchaseRequestId: prId }).then(setLinkedPOs).catch(() => {});
    listCafs({ purchaseRequestId: prId }).then(setLinkedCAFs).catch(() => {});
    listOrs({ purchaseRequestId: prId }).then(setLinkedORS).catch(() => {});
  }, [state.status === 'loaded' ? state.data.id : null]);

  async function doAction(
    action: 'submit' | 'endorse' | 'budget_certify' | 'approve' | 'accept' | 'return' | 'reject' | 'cancel',
  ) {
    if (state.status !== 'loaded' || acting) return;
    const pr = state.data;
    setActing(true);
    setActionError(null);

    let remarks: string | undefined;
    if (action === 'reject' || action === 'cancel' || action === 'return') {
      const input = window.prompt(`Reason for ${action === 'return' ? 'returning' : action}:`);
      if (input === null) { setActing(false); return; }
      remarks = input || undefined;
    }

    try {
      let updated: PurchaseRequest;
      switch (action) {
        case 'submit':
          updated = await submitPurchaseRequest(pr.id, pr.version);
          break;
        case 'endorse':
          updated = await endorsePurchaseRequest(pr.id, pr.version, remarks);
          break;
        case 'budget_certify':
          updated = await budgetCertifyPurchaseRequest(pr.id, pr.version, remarks);
          break;
        case 'approve':
          updated = await finalApprovePurchaseRequest(pr.id, pr.version, remarks);
          break;
        case 'accept':
          updated = await acceptForProcurement(pr.id, pr.version);
          break;
        case 'return':
          updated = await returnPurchaseRequest(pr.id, pr.version, remarks);
          break;
        case 'reject':
          updated = await rejectPurchaseRequest(pr.id, pr.version, remarks);
          break;
        case 'cancel':
          updated = await cancelPurchaseRequest(pr.id, pr.version, remarks);
          break;
      }
      setState({ status: 'loaded', data: updated });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action}.`);
    } finally {
      setActing(false);
    }
  }

  if (state.status === 'loading') return <div className="pr-page"><p style={{ color: '#667085' }}>Loading...</p></div>;
  if (state.status === 'error') return <div className="pr-page"><div className="pr-error">{state.message}</div></div>;

  const pr = state.data;
  const isCreator = pr.createdBy === user?.sub;
  const currentStep = stepIndex(pr.status);
  const isTerminal = TERMINAL_STATUSES.has(pr.status);

  return (
    <div className="pr-page">
      <a href="/procurement" className="pr-back" onClick={(e) => { e.preventDefault(); navigate('/procurement'); }}>
        &larr; Back to Purchase Requests
      </a>

      <div className="pr-detail-header">
        <h1>{pr.prNumber}</h1>
        <span className={`pr-badge pr-badge--${pr.status}`}>{STATUS_LABELS[pr.status] ?? pr.status}</span>
      </div>

      {actionError && <div className="pr-error">{actionError}</div>}

      {/* Workflow Progress */}
      {!isTerminal && (
        <div className="pr-workflow">
          {WORKFLOW_STEPS.map((step, idx) => {
            const done = currentStep > idx;
            const active = currentStep === idx;
            return (
              <div key={step.status} className={`pr-workflow__step ${done ? 'pr-workflow__step--done' : ''} ${active ? 'pr-workflow__step--active' : ''}`}>
                <div className="pr-workflow__circle">{done ? '✓' : idx + 1}</div>
                <div className="pr-workflow__label">{step.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {isTerminal && (
        <div className={`pr-terminal-banner pr-terminal-banner--${pr.status}`}>
          <div>This PR has been <strong>{STATUS_LABELS[pr.status]?.toLowerCase()}</strong>.</div>
          {pr.remarks && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, fontSize: 13 }}>
              <strong>Reason:</strong> {pr.remarks}
            </div>
          )}
        </div>
      )}

      <dl className="pr-detail-meta">
        <div>
          <dt>Title</dt>
          <dd>{pr.title}</dd>
        </div>
        <div>
          <dt>Total Amount</dt>
          <dd style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPeso(pr.totalAmount)}</dd>
        </div>
        <div>
          <dt>Budget Release</dt>
          <dd>{pr.budgetRelease?.releaseNumber ?? '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{new Date(pr.createdAt).toLocaleString()}</dd>
        </div>
        {pr.department && (
          <div>
            <dt>Department</dt>
            <dd>{pr.department.name} ({pr.department.code})</dd>
          </div>
        )}
        {pr.requestedDeliveryDate && (
          <div>
            <dt>Requested Delivery</dt>
            <dd>{new Date(pr.requestedDeliveryDate).toLocaleDateString()}</dd>
          </div>
        )}
        {pr.ppmpItem && (
          <div>
            <dt>PPMP Item</dt>
            <dd>{pr.ppmpItem.code} — {pr.ppmpItem.itemDescription}</dd>
          </div>
        )}
        {pr.appItem && (
          <div>
            <dt>APP Item</dt>
            <dd>{pr.appItem.appNumber} — {pr.appItem.procurementProjectTitle}</dd>
          </div>
        )}
        {pr.purpose && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Purpose / Justification</dt>
            <dd style={{ fontWeight: 400 }}>{pr.purpose}</dd>
          </div>
        )}
        {pr.description && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Description</dt>
            <dd style={{ fontWeight: 400 }}>{pr.description}</dd>
          </div>
        )}
      </dl>

      {/* Approval Trail */}
      {(pr.endorser || pr.budgetCertifier || pr.approver) && (
        <div className="pr-audit-trail">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 8px' }}>Approval History</h3>
          <div className="pr-audit-trail__entries">
            {pr.creator && (
              <div className="pr-audit-entry">
                <span className="pr-audit-entry__role">Requested by</span>
                <span className="pr-audit-entry__user">{pr.creator.username}</span>
                <span className="pr-audit-entry__date">{new Date(pr.createdAt).toLocaleString()}</span>
              </div>
            )}
            {pr.endorser && pr.endorsedAt && (
              <div className="pr-audit-entry">
                <span className="pr-audit-entry__role">Endorsed by</span>
                <span className="pr-audit-entry__user">{pr.endorser.username}</span>
                <span className="pr-audit-entry__date">{new Date(pr.endorsedAt).toLocaleString()}</span>
              </div>
            )}
            {pr.budgetCertifier && pr.budgetCertifiedAt && (
              <div className="pr-audit-entry">
                <span className="pr-audit-entry__role">Budget certified by</span>
                <span className="pr-audit-entry__user">{pr.budgetCertifier.username}</span>
                <span className="pr-audit-entry__date">{new Date(pr.budgetCertifiedAt).toLocaleString()}</span>
              </div>
            )}
            {pr.approver && pr.approvedAt && (
              <div className="pr-audit-entry">
                <span className="pr-audit-entry__role">Approved by</span>
                <span className="pr-audit-entry__user">{pr.approver.username}</span>
                <span className="pr-audit-entry__date">{new Date(pr.approvedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons — gated by status + permissions */}
      <div className="pr-detail-actions">
        {(pr.status === 'draft' || pr.status === 'returned') && isCreator && hasPermission('procurement.pr.edit') && (
          <Link to={`/procurement/purchase-requests/${pr.id}/edit`} className="pr-btn" style={{ textDecoration: 'none' }}>
            Edit
          </Link>
        )}

        {pr.status === 'draft' && isCreator && hasPermission('procurement.pr.submit') && (
          <button className="pr-btn pr-btn--primary" onClick={() => doAction('submit')} disabled={acting}>
            {acting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        )}

        {pr.status === 'submitted' && hasPermission('procurement.pr.endorse') && (
          <button className="pr-btn pr-btn--success" onClick={() => doAction('endorse')} disabled={acting}>
            {acting ? 'Endorsing...' : 'Endorse'}
          </button>
        )}

        {pr.status === 'endorsed' && hasPermission('procurement.pr.budget_certify') && (
          <button className="pr-btn pr-btn--success" onClick={() => doAction('budget_certify')} disabled={acting}>
            {acting ? 'Certifying...' : 'Certify Budget'}
          </button>
        )}

        {pr.status === 'budget_certified' && hasPermission('procurement.pr.final_approve') && (
          <button className="pr-btn pr-btn--success" onClick={() => doAction('approve')} disabled={acting}>
            {acting ? 'Approving...' : 'Approve'}
          </button>
        )}

        {pr.status === 'approved' && hasPermission('procurement.pr.accept_procurement') && (
          <button className="pr-btn pr-btn--success" onClick={() => doAction('accept')} disabled={acting}>
            {acting ? 'Accepting...' : 'Accept for Procurement'}
          </button>
        )}

        {pr.status === 'procurement_in_progress' && hasPermission('procurement.pr.accept_procurement') && (
          <Link to={`/procurement/purchase-requests/${pr.id}/print`} className="pr-btn pr-btn--primary" style={{ textDecoration: 'none' }}>
            Print PR
          </Link>
        )}

        {['submitted', 'endorsed', 'budget_certified'].includes(pr.status) && hasPermission('procurement.pr.return_to_user') && (
          <button className="pr-btn pr-btn--warning" onClick={() => doAction('return')} disabled={acting}>
            Return to User
          </button>
        )}

        {['submitted', 'endorsed', 'budget_certified'].includes(pr.status) && hasPermission('procurement.pr.reject') && (
          <button className="pr-btn pr-btn--danger" onClick={() => doAction('reject')} disabled={acting}>
            Reject
          </button>
        )}

        {pr.status === 'draft' && isCreator && hasPermission('procurement.pr.cancel') && (
          <button className="pr-btn pr-btn--danger" onClick={() => doAction('cancel')} disabled={acting}>Cancel</button>
        )}

        {/* Post-procurement lifecycle buttons */}
        {pr.status === 'po_issued' && hasPermission('procurement.pr.mark_lifecycle') && (
          <button className="pr-btn pr-btn--success" disabled={acting} onClick={async () => {
            setActing(true); setActionError(null);
            try { setState({ status: 'loaded', data: await markPrLifecycle(pr.id, pr.version, 'delivered') }); }
            catch (e) { setActionError(e instanceof Error ? e.message : 'Failed.'); }
            finally { setActing(false); }
          }}>Mark as Delivered</button>
        )}

        {pr.status === 'delivered' && hasPermission('procurement.pr.inspect') && (
          <button className="pr-btn pr-btn--success" disabled={acting} onClick={async () => {
            setActing(true); setActionError(null);
            try { setState({ status: 'loaded', data: await inspectPr(pr.id, pr.version) }); }
            catch (e) { setActionError(e instanceof Error ? e.message : 'Failed.'); }
            finally { setActing(false); }
          }}>Mark as Inspected</button>
        )}

        {pr.status === 'inspected' && hasPermission('procurement.pr.mark_lifecycle') && (
          <button className="pr-btn pr-btn--success" disabled={acting} onClick={async () => {
            setActing(true); setActionError(null);
            try { setState({ status: 'loaded', data: await markPrLifecycle(pr.id, pr.version, 'completed') }); }
            catch (e) { setActionError(e instanceof Error ? e.message : 'Failed.'); }
            finally { setActing(false); }
          }}>Mark as Completed</button>
        )}
      </div>

      {/* ── Financial Chain Summary ── */}
      {(linkedPOs.length > 0 || linkedCAFs.length > 0 || linkedORS.length > 0) && (
        <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0c4a6e' }}>Financial Chain</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140, background: '#fff', borderRadius: 6, padding: 12, border: '1px solid #e0f2fe' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PR Amount</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(pr.totalAmount)}</div>
            </div>
            {linkedPOs.length > 0 && (
              <div style={{ flex: 1, minWidth: 140, background: '#fff', borderRadius: 6, padding: 12, border: '1px solid #e0f2fe' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PO Contract</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(linkedPOs.reduce((sum, po) => sum + parseFloat(po.contractAmount), 0).toFixed(2))}
                </div>
                <div style={{ fontSize: 11, color: '#667085' }}>{linkedPOs.length} PO(s) — {linkedPOs.filter(p => p.status === 'approved').length} approved</div>
              </div>
            )}
            {linkedCAFs.length > 0 && (
              <div style={{ flex: 1, minWidth: 140, background: '#fff', borderRadius: 6, padding: 12, border: '1px solid #e0f2fe' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CAF Certified</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(linkedCAFs.filter(c => c.status === 'certified').reduce((sum, c) => sum + parseFloat(c.certifiedAmount), 0).toFixed(2))}
                </div>
                <div style={{ fontSize: 11, color: '#667085' }}>{linkedCAFs.length} CAF(s) — {linkedCAFs.filter(c => c.status === 'certified').length} certified</div>
              </div>
            )}
            {linkedORS.length > 0 && (
              <div style={{ flex: 1, minWidth: 140, background: '#fff', borderRadius: 6, padding: 12, border: '1px solid #e0f2fe' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Obligated</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatPeso(linkedORS.reduce((sum, o) => sum + parseFloat(o.adjustedAmount), 0).toFixed(2))}
                </div>
                <div style={{ fontSize: 11, color: '#667085' }}>
                  {linkedORS.length} ORS — Paid: {formatPeso(linkedORS.reduce((sum, o) => sum + parseFloat(o.cumulativePaid), 0).toFixed(2))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 12px' }}>
        Items ({pr.items.length})
      </h3>

      <table className="pr-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Unit Cost</th>
            <th>Total</th>
            <th>Class</th>
          </tr>
        </thead>
        <tbody>
          {pr.items.map((item) => (
            <tr key={item.id}>
              <td>{item.itemNumber}</td>
              <td>
                {item.description}
                {item.technicalSpecification && (
                  <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{item.technicalSpecification}</div>
                )}
              </td>
              <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{parseFloat(item.quantity).toLocaleString()}</td>
              <td>{item.unitOfMeasure}</td>
              <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPeso(item.estimatedUnitCost)}</td>
              <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatPeso(item.estimatedTotalCost)}</td>
              <td style={{ fontSize: 11, textTransform: 'capitalize' }}>{item.classification ?? '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--mswd-navy)' }}>Total</td>
            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'var(--mswd-navy)' }}>
              {formatPeso(pr.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── Linked Purchase Orders ── */}
      {linkedPOs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 12px' }}>
            Purchase Orders ({linkedPOs.length})
          </h3>
          <table className="pr-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Contract Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {linkedPOs.map((po) => (
                <tr key={po.id}>
                  <td>
                    <Link to={`/procurement/purchase-orders/${po.id}`} className="pr-table__link">{po.poNumber}</Link>
                  </td>
                  <td>{po.supplier.name}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPeso(po.contractAmount)}</td>
                  <td><span className={`pr-badge pr-badge--${po.status}`}>{po.status.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: 12, color: '#667085' }}>{new Date(po.poDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Linked CAFs ── */}
      {linkedCAFs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 12px' }}>
            Certificates of Availability of Funds ({linkedCAFs.length})
          </h3>
          <table className="pr-table">
            <thead>
              <tr>
                <th>CAF Number</th>
                <th>Certified Amount</th>
                <th>Budget Release</th>
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
                  <td>{caf.budgetRelease.releaseNumber}</td>
                  <td><span className={`pr-badge pr-badge--${caf.status}`}>{caf.status.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: 12, color: '#667085' }}>{new Date(caf.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Linked ORS ── */}
      {linkedORS.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)', margin: '0 0 12px' }}>
            Obligation Requests ({linkedORS.length})
          </h3>
          <table className="pr-table">
            <thead>
              <tr>
                <th>ORS Number</th>
                <th>Original Amt</th>
                <th>Adjusted Amt</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {linkedORS.map((ors) => (
                <tr key={ors.id}>
                  <td>
                    <Link to={`/procurement/ors/${ors.id}`} className="pr-table__link">{ors.orsNumber}</Link>
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPeso(ors.originalAmount)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPeso(ors.adjustedAmount)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPeso(ors.remainingUnpaid)}</td>
                  <td><span className={`pr-badge pr-badge--${ors.status}`}>{ors.status.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: 12, color: '#667085' }}>{new Date(ors.orsDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
