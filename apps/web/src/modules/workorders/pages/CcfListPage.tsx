import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getCcfs } from '../api';
import {
  CCF_CATEGORY_LABELS,
  CCF_STATUS_LABELS,
  WO_STATUS_LABELS,
  type Ccf,
  type CcfCategory,
  type CcfStatus,
} from '../types';
import '../workorders.css';

export function ccfStatusStyle(status: CcfStatus): React.CSSProperties {
  const map: Record<CcfStatus, { bg: string; fg: string }> = {
    pending: { bg: '#fef0c7', fg: '#b54708' },
    in_progress: { bg: '#d1e9ff', fg: '#175cd3' },
    resolved: { bg: '#d1fadf', fg: '#067647' },
    closed: { bg: '#eaecf0', fg: '#475467' },
  };
  const c = map[status];
  return {
    background: c.bg,
    color: c.fg,
    borderRadius: 12,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

export function formatReceived(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const CATEGORIES = Object.keys(CCF_CATEGORY_LABELS) as CcfCategory[];
const STATUSES = Object.keys(CCF_STATUS_LABELS) as CcfStatus[];

export default function CcfListPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Ccf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const search = searchParams.get('search') ?? '';

  useEffect(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (category) p.set('category', category);
    if (search) p.set('search', search);
    setLoading(true);
    getCcfs(p.toString())
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, category, search]);

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value);
    else p.delete(key);
    setSearchParams(p);
  };

  const summary = useMemo(() => {
    const open = rows.filter((r) => r.isOpen);
    const overdue = open.filter((r) => r.overdue);
    const resolved = rows.filter((r) => !r.isOpen);
    const avgResolveDays = resolved.length
      ? Math.round(resolved.reduce((s, r) => s + r.daysOpen, 0) / resolved.length)
      : 0;
    return { total: rows.length, open: open.length, overdue: overdue.length, avgResolveDays };
  }, [rows]);

  const canCreate = permissions.has('workorder.create');

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>Customer Feedback &amp; Resolution Register (CFRR)</h1>
        {canCreate && (
          <Link to="/work-orders/ccf/new" className="wo-btn wo-btn--primary">
            + New CCF
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '0 0 16px' }}>
        {[
          { label: 'Total concerns', value: summary.total, bg: '#f2f4f7', fg: '#344054' },
          { label: 'Still open', value: summary.open, bg: '#eff8ff', fg: '#175cd3' },
          { label: 'Open & overdue', value: summary.overdue, bg: '#fef3f2', fg: '#b42318' },
          { label: 'Avg days to resolve', value: summary.avgResolveDays, bg: '#ecfdf3', fg: '#067647' },
        ].map((c) => (
          <div
            key={c.label}
            style={{ flex: '1 1 150px', background: c.bg, borderRadius: 10, padding: '12px 16px' }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: c.fg }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.fg }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="wo-filters">
        <input
          type="text"
          placeholder="Search reference, customer, account, nature…"
          className="wo-input"
          value={search}
          onChange={(e) => setParam('search', e.target.value)}
        />
        <select className="wo-select" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {CCF_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="wo-select"
          value={category}
          onChange={(e) => setParam('category', e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CCF_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 13, color: '#667085', margin: '0 0 12px' }}>
        Consolidated register of all customer complaints/concerns. "Days Open" counts from the date
        received to resolution (or today if still open); rows shaded red are open past their target
        resolution date. Click a row to open and update it.
      </p>

      {error && <div className="wo-error">{error}</div>}
      {loading ? (
        <div className="wo-empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="wo-empty">No customer concerns found.</div>
      ) : (
        <div className="wo-table-wrap">
          <table className="wo-table wo-table--compact">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Received</th>
                <th>Customer / Account</th>
                <th>Category</th>
                <th>Nature</th>
                <th>Action Taken</th>
                <th>Status</th>
                <th>Work Order Ref.</th>
                <th>Target</th>
                <th>Resolved</th>
                <th style={{ textAlign: 'right' }}>Days Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: 'pointer', ...(r.overdue ? { background: '#fef3f2' } : {}) }}
                  onClick={() => {
                    if (window.getSelection()?.toString()) return;
                    navigate(`/work-orders/ccf/${r.id}`);
                  }}
                >
                  <td>
                    <Link
                      to={`/work-orders/ccf/${r.id}`}
                      className="wo-table__link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.referenceNumber}
                    </Link>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatReceived(r.receivedAt)}</td>
                  <td>
                    {r.customerName}
                    {r.accountNumber ? (
                      <div style={{ fontSize: 11, color: '#667085' }}>{r.accountNumber}</div>
                    ) : null}
                  </td>
                  <td>{CCF_CATEGORY_LABELS[r.category]}</td>
                  <td style={{ minWidth: 240, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                    {r.nature}
                  </td>
                  <td style={{ minWidth: 160, maxWidth: 220, whiteSpace: 'normal' }}>{r.actionTaken || '—'}</td>
                  <td>
                    <span style={ccfStatusStyle(r.status)}>{CCF_STATUS_LABELS[r.status]}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {r.workOrders && r.workOrders.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {r.workOrders.map((w) => (
                          <Link
                            key={w.id}
                            to={`/work-orders/${w.id}`}
                            className="wo-table__link"
                            onClick={(e) => e.stopPropagation()}
                            title={w.title}
                          >
                            {w.woNumber}{' '}
                            <span style={{ color: '#667085' }}>
                              ({WO_STATUS_LABELS[w.status] ?? w.status})
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.targetResolutionDate)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.resolvedAt)}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      color: r.overdue ? '#b42318' : r.isOpen ? '#344054' : '#98a2b3',
                    }}
                  >
                    {r.daysOpen}
                    {r.overdue ? ' ⚠' : ''}
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
