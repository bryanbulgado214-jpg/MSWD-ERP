import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getCcfs } from '../api';
import {
  CCF_CATEGORY_LABELS,
  CCF_STATUS_LABELS,
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
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

  const canCreate = permissions.has('workorder.create');

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>Customer Complaints / Concerns (CCF)</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/work-orders" className="wo-btn wo-btn--nav">
            &larr; Work Orders
          </Link>
          <Link to="/work-orders/cfrr" className="wo-btn wo-btn--nav">
            <span className="wo-btn__icon" aria-hidden="true">{'\u{1F4CB}'}</span> CFRR Register
          </Link>
          {canCreate && (
            <Link to="/work-orders/ccf/new" className="wo-btn wo-btn--primary">
              + New CCF
            </Link>
          )}
        </div>
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

      {error && <div className="wo-error">{error}</div>}
      {loading ? (
        <div className="wo-empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="wo-empty">No customer concerns found.</div>
      ) : (
        <div className="wo-table-wrap">
          <table className="wo-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Received</th>
                <th>Customer / Account</th>
                <th>Category</th>
                <th>Assigned</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Days Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: 'pointer' }}
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
                      <div style={{ fontSize: 12, color: '#667085' }}>{r.accountNumber}</div>
                    ) : null}
                  </td>
                  <td>{CCF_CATEGORY_LABELS[r.category]}</td>
                  <td>{r.assignedTo || '—'}</td>
                  <td>
                    <span style={ccfStatusStyle(r.status)}>{CCF_STATUS_LABELS[r.status]}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {r.isOpen ? (
                      <span style={{ color: r.overdue ? '#b42318' : '#344054' }}>
                        {r.daysOpen}
                        {r.overdue ? ' ⚠' : ''}
                      </span>
                    ) : (
                      <span style={{ color: '#98a2b3' }}>{r.daysOpen}</span>
                    )}
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
