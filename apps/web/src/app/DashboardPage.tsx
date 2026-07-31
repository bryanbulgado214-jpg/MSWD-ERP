import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from './auth';
import { hasModuleAccess } from './module-access';
import { formatPeso } from '../modules/budgeting/format-peso';
import './dashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

interface PendingActionItem {
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

interface StatCard {
  label: string;
  value: number;
  color: string;
}

const MODULE_CARDS = [
  {
    key: 'budgeting' as const,
    to: '/budgeting',
    icon: '\u{1F4CA}',
    name: 'Budgeting',
    description: 'Manage budget cycles, fund sources, appropriations, releases, and reservations.',
  },
  {
    key: 'procurement' as const,
    to: '/procurement',
    icon: '\u{1F4CB}',
    name: 'Procurement',
    description: 'Create purchase requests, manage PPMP items, and track approval workflows.',
  },
];

export function DashboardPage() {
  const { user, permissions } = useAuth();
  const [items, setItems] = useState<PendingActionItem[]>([]);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mswd_access_token');
    if (!token) { setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE_URL}/dashboard/pending-actions`, { headers })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items: PendingActionItem[] }) => data.items),
      fetch(`${API_BASE_URL}/dashboard/stats`, { headers })
        .then((res) => (res.ok ? res.json() : { stats: [] }))
        .then((data: { stats: StatCard[] }) => data.stats),
    ])
      .then(([actionItems, statCards]) => {
        setItems(actionItems);
        setStats(statCards);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visibleModules = MODULE_CARDS.filter((m) => hasModuleAccess(permissions, m.key));

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__greeting">Welcome, {user?.username ?? 'User'}</h1>
        <p className="dashboard__date">{today}</p>
      </div>

      {/* ── Stats ── */}
      {stats.length > 0 && (
        <div className="dashboard__stats">
          {stats.map((s) => (
            <div key={s.label} className="dashboard__stat-card">
              <div className="dashboard__stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="dashboard__stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pending Actions ── */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">
          Pending Actions
          <span className={`dashboard__count-badge${items.length === 0 ? ' dashboard__count-badge--zero' : ''}`}>
            {loading ? '...' : items.length}
          </span>
        </h2>

        {loading && <div className="dashboard__loading">Loading pending actions...</div>}

        {!loading && items.length === 0 && (
          <div className="dashboard__empty">
            No items require your action right now.
          </div>
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

      {/* ── Modules ── */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">Modules</h2>
        <div className="dashboard__modules">
          {visibleModules.map((mod) => (
            <Link key={mod.key} to={mod.to} className="dashboard__module-card">
              <span className="dashboard__module-icon">{mod.icon}</span>
              <span className="dashboard__module-name">{mod.name}</span>
              <span className="dashboard__module-desc">{mod.description}</span>
            </Link>
          ))}
          {visibleModules.length === 0 && (
            <div className="dashboard__empty">No modules are available for your role.</div>
          )}
        </div>
      </div>
    </div>
  );
}
