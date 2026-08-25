import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../modules/budgeting/format-peso';

import './dashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export interface PendingActionItem {
  id: string;
  module: string;
  type: string;
  label: string;
  description: string;
  amount: string;
  createdAt: string;
  actionLabel: string;
  link: string;
  createdBy?: string;
}

/**
 * The permission-filtered "what needs my action" feed, backed by
 * GET /dashboard/pending-actions. Rendered on the Home dashboard and, for the
 * cashier, at the top of the Cashiering Dashboard. Pass hideWhenEmpty to omit
 * the whole section when there is nothing to act on.
 */
export function PendingActions({
  title = 'Pending Actions',
  hideWhenEmpty = false,
}: {
  title?: string;
  hideWhenEmpty?: boolean;
}) {
  const [items, setItems] = useState<PendingActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mswd_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/dashboard/pending-actions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items: PendingActionItem[] }) => setItems(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (hideWhenEmpty && !loading && items.length === 0) return null;

  return (
    <div className="dashboard__section">
      <h2 className="dashboard__section-title">
        {title}
        <span
          className={`dashboard__count-badge${items.length === 0 ? ' dashboard__count-badge--zero' : ''}`}
        >
          {loading ? '...' : items.length}
        </span>
      </h2>

      {loading && <div className="dashboard__loading">Loading pending actions...</div>}

      {!loading && items.length === 0 && (
        <div className="dashboard__empty">No items require your action right now.</div>
      )}

      {!loading && items.length > 0 && (
        <div className="dashboard__actions-list">
          {items.map((item) => (
            <div key={`${item.type}-${item.id}`} className="dashboard__action-card">
              <span className={`dashboard__action-module dashboard__action-module--${item.module}`}>
                {item.module}
              </span>
              <div className="dashboard__action-body">
                <div className="dashboard__action-label">
                  {item.label}
                  {item.createdBy ? ` — by ${item.createdBy}` : ''}
                </div>
                <div className="dashboard__action-desc">{item.description}</div>
              </div>
              <span className="dashboard__action-amount">{formatPeso(item.amount)}</span>
              <Link to={item.link} className="dashboard__action-link">
                {item.actionLabel} &rarr;
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
