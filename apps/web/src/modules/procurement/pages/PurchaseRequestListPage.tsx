import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import {
  listPendingApproval,
  listPendingBudgetCertification,
  listPendingEndorsement,
  listPendingProcurement,
  listPurchaseRequests,
  ProcurementApiError,
} from '../api';
import type { PurchaseRequest } from '../types';
import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: PurchaseRequest[] };

const TERMINAL_STATUSES = ['cancelled', 'rejected', 'voided', 'completed'];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active (non-terminal)' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'endorsed', label: 'Endorsed' },
  { value: 'budget_certified', label: 'Budget Certified' },
  { value: 'approved', label: 'Approved' },
  { value: 'procurement_in_progress', label: 'Procurement In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'returned', label: 'Returned' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', endorsed: 'Endorsed',
  budget_certified: 'Budget Certified', approved: 'Approved',
  procurement_in_progress: 'In Procurement', returned: 'Returned',
  rejected: 'Rejected', cancelled: 'Cancelled', completed: 'Completed',
  awarded: 'Awarded', po_issued: 'PO Issued', delivered: 'Delivered',
  inspected: 'Inspected',
};

interface PendingQueue {
  permission: string;
  label: string;
  actionLabel: string;
  fetch: () => Promise<PurchaseRequest[]>;
}

const QUEUES: PendingQueue[] = [
  { permission: 'procurement.pr.endorse', label: 'Pending Your Endorsement', actionLabel: 'Endorse', fetch: listPendingEndorsement },
  { permission: 'procurement.pr.budget_certify', label: 'Pending Budget Certification', actionLabel: 'Certify', fetch: listPendingBudgetCertification },
  { permission: 'procurement.pr.final_approve', label: 'Pending Your Approval', actionLabel: 'Approve', fetch: listPendingApproval },
  { permission: 'procurement.pr.accept_procurement', label: 'Pending Procurement Acceptance', actionLabel: 'Accept', fetch: listPendingProcurement },
];

export function PurchaseRequestListPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pendingItems, setPendingItems] = useState<PurchaseRequest[]>([]);
  const [pendingLabel, setPendingLabel] = useState('');
  const [loadingPending, setLoadingPending] = useState(true);

  const activeQueue = QUEUES.find((q) => hasPermission(q.permission));

  useEffect(() => {
    if (!activeQueue) { setLoadingPending(false); return; }
    let cancelled = false;
    setLoadingPending(true);
    setPendingLabel(activeQueue.label);
    activeQueue.fetch()
      .then((data) => { if (!cancelled) setPendingItems(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingPending(false); });
    return () => { cancelled = true; };
  }, [activeQueue?.permission]);

  useEffect(() => {
    if (statusFilter) {
      setSearchParams({ status: statusFilter }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const apiStatus = statusFilter === 'active' ? undefined : statusFilter || undefined;
    listPurchaseRequests(apiStatus)
      .then((data) => {
        if (cancelled) return;
        const filtered = statusFilter === 'active'
          ? data.filter((pr) => !TERMINAL_STATUSES.includes(pr.status))
          : data;
        setState({ status: 'loaded', data: filtered });
      })
      .catch((err) => { if (!cancelled) setState({ status: 'error', message: err instanceof ProcurementApiError ? err.message : 'Failed to load purchase requests.' }); });
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Purchase Requests</h1>

      {/* Pending Action Queue */}
      {activeQueue && !loadingPending && pendingItems.length > 0 && (
        <div className="pr-pending-queue">
          <h2 className="pr-pending-queue__title">
            {pendingLabel}
            <span className="pr-pending-queue__count">{pendingItems.length}</span>
          </h2>
          <table className="pr-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>PR Number</th>
                <th>Title</th>
                <th>Total Amount</th>
                <th>Requested By</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <Link to={`/procurement/purchase-requests/${pr.id}`} className="pr-table__link">
                      {pr.prNumber}
                    </Link>
                  </td>
                  <td>{pr.title}</td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {formatPeso(pr.totalAmount)}
                  </td>
                  <td>{pr.creator?.username ?? '—'}</td>
                  <td style={{ fontSize: 12, color: '#667085' }}>
                    {new Date(pr.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <Link
                      to={`/procurement/purchase-requests/${pr.id}`}
                      className="pr-btn pr-btn--success"
                      style={{ textDecoration: 'none', padding: '4px 12px', fontSize: 12 }}
                    >
                      {activeQueue.actionLabel} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activeQueue && !loadingPending && pendingItems.length === 0 && (
        <div className="pr-pending-queue pr-pending-queue--empty">
          No purchase requests pending your action.
        </div>
      )}
      {activeQueue && loadingPending && (
        <div className="pr-pending-queue pr-pending-queue--empty">
          Loading pending items...
        </div>
      )}

      {/* All PRs */}
      <div className="pr-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {hasPermission('procurement.ppmp.manage') && (
          <Link to="/procurement/ppmp-items" className="pr-btn" style={{ textDecoration: 'none' }}>
            PPMP Data Entry
          </Link>
        )}
        {hasPermission('procurement.pr.create') && (
          <Link to="/procurement/purchase-requests/new" className="pr-btn pr-btn--primary" style={{ textDecoration: 'none' }}>
            + New Purchase Request
          </Link>
        )}
      </div>

      {state.status === 'loading' && <p style={{ color: '#667085' }}>Loading...</p>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No purchase requests found.</div>
      )}

      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="pr-table">
          <thead>
            <tr>
              <th>PR Number</th>
              <th>Title</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((pr) => (
              <tr key={pr.id}>
                <td>
                  <Link to={`/procurement/purchase-requests/${pr.id}`} className="pr-table__link">
                    {pr.prNumber}
                  </Link>
                </td>
                <td>{pr.title}</td>
                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  {formatPeso(pr.totalAmount)}
                </td>
                <td><span className={`pr-badge pr-badge--${pr.status}`}>{STATUS_LABELS[pr.status] ?? pr.status}</span></td>
                <td>{pr.creator?.username ?? '—'}</td>
                <td style={{ fontSize: '12px', color: '#667085' }}>
                  {new Date(pr.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
