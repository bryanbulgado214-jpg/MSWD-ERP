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
  link?: string;
}

interface ExecutiveSummary {
  billing: {
    totalBilled: string;
    totalCollected: string;
    collectionRate: number;
    outstandingBalance: string;
    activeConsumers: number;
    disconnectedConsumers: number;
  };
  procurement: {
    activePRs: number;
    activePRValue: string;
    approvedPOs: number;
    approvedPOValue: string;
    releasedDVs: number;
    releasedDVValue: string;
  };
  hr: {
    totalEmployees: number;
    activeEmployees: number;
    onLeave: number;
    totalPayrollGross: string;
    totalPayrollNet: string;
    paidPayrollRuns: number;
  };
  budget: {
    approvedBudget: string;
    totalReleased: string;
    totalObligated: string;
    utilizationRate: number;
  };
  inventory: {
    totalItems: number;
    totalValue: string;
    belowReorder: number;
  };
  accounting: {
    postedJevs: number;
    totalDebits: string;
    recentJevs: Array<{
      id: string;
      jevNumber: string;
      jevDate: string;
      particulars: string;
      totalDebit: string;
      sourceType: string;
    }>;
  };
}

const MODULE_CARDS: Array<{
  key: 'budgeting' | 'procurement' | 'inventory' | 'billing' | 'hr' | 'accounting';
  to: string;
  icon: string;
  name: string;
  description: string;
}> = [
  { key: 'budgeting', to: '/budgeting', icon: '\u{1F4CA}', name: 'Budgeting', description: 'Budget cycles, fund sources, appropriations & releases.' },
  { key: 'procurement', to: '/procurement', icon: '\u{1F4CB}', name: 'Procurement', description: 'Purchase requests, orders, CAF, ORS & disbursements.' },
  { key: 'inventory', to: '/inventory', icon: '\u{1F4E6}', name: 'Inventory', description: 'Item catalog, stock receipts, issuances & property.' },
  { key: 'billing', to: '/billing', icon: '\u{1F4B0}', name: 'Billing & Collections', description: 'Consumer billing, meter readings, payments & arrears.' },
  { key: 'hr', to: '/hr', icon: '\u{1F465}', name: 'HR & Payroll', description: 'Employees, attendance, leave, payroll & remittances.' },
  { key: 'accounting', to: '/accounting', icon: '\u{1F4D2}', name: 'Accounting', description: 'Chart of accounts, JEVs, GL, bank reconciliation.' },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DashboardPage() {
  const { user, permissions } = useAuth();
  const [items, setItems] = useState<PendingActionItem[]>([]);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [exec, setExec] = useState<ExecutiveSummary | null>(null);
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
      fetch(`${API_BASE_URL}/dashboard/executive`, { headers })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([actionItems, statCards, execData]) => {
        setItems(actionItems);
        setStats(statCards);
        setExec(execData);
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

  const hasBilling = hasModuleAccess(permissions, 'billing');
  const hasProcurement = hasModuleAccess(permissions, 'procurement');
  const hasHr = hasModuleAccess(permissions, 'hr');
  const hasBudgeting = hasModuleAccess(permissions, 'budgeting');
  const hasInventory = hasModuleAccess(permissions, 'inventory');
  const hasAccounting = hasModuleAccess(permissions, 'accounting');

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__greeting">Welcome, {user?.username ?? 'User'}</h1>
        <p className="dashboard__date">{today}</p>
      </div>

      {/* ── Executive Summary ── */}
      {exec && (
        <div className="dashboard__section">
          <h2 className="dashboard__section-title">Executive Summary</h2>

          <div className="exec-grid">
            {/* Revenue & Collections */}
            {hasBilling && (
              <Link to="/billing" className="exec-card exec-card--blue">
                <div className="exec-card__header">Billing & Collections</div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Total Billed</span>
                  <span className="exec-card__value">{formatPeso(exec.billing.totalBilled)}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Collected</span>
                  <span className="exec-card__value exec-card__value--green">{formatPeso(exec.billing.totalCollected)}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Collection Rate</span>
                  <span className={`exec-card__value ${exec.billing.collectionRate >= 80 ? 'exec-card__value--green' : 'exec-card__value--amber'}`}>
                    {exec.billing.collectionRate}%
                  </span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Outstanding</span>
                  <span className="exec-card__value exec-card__value--red">{formatPeso(exec.billing.outstandingBalance)}</span>
                </div>
                <div className="exec-card__footer">
                  <span>{exec.billing.activeConsumers} active consumers</span>
                  {exec.billing.disconnectedConsumers > 0 && (
                    <span className="exec-card__tag--warn">{exec.billing.disconnectedConsumers} disconnected</span>
                  )}
                </div>
              </Link>
            )}

            {/* Budget */}
            {hasBudgeting && (
              <Link to="/budgeting" className="exec-card exec-card--teal">
                <div className="exec-card__header">Budget</div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Approved Budget</span>
                  <span className="exec-card__value">{formatPeso(exec.budget.approvedBudget)}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Released</span>
                  <span className="exec-card__value">{formatPeso(exec.budget.totalReleased)}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Obligated</span>
                  <span className="exec-card__value">{formatPeso(exec.budget.totalObligated)}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Utilization</span>
                  <span className={`exec-card__value ${exec.budget.utilizationRate >= 50 ? 'exec-card__value--green' : 'exec-card__value--amber'}`}>
                    {exec.budget.utilizationRate}%
                  </span>
                </div>
              </Link>
            )}

            {/* Procurement & Expenditures */}
            {hasProcurement && (
              <Link to="/procurement" className="exec-card exec-card--navy">
                <div className="exec-card__header">Procurement</div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Active PRs</span>
                  <span className="exec-card__value">{exec.procurement.activePRs} ({formatPeso(exec.procurement.activePRValue)})</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Approved POs</span>
                  <span className="exec-card__value">{exec.procurement.approvedPOs} ({formatPeso(exec.procurement.approvedPOValue)})</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Disbursed (DVs)</span>
                  <span className="exec-card__value exec-card__value--green">{formatPeso(exec.procurement.releasedDVValue)}</span>
                </div>
                <div className="exec-card__footer">
                  <span>{exec.procurement.releasedDVs} DVs released</span>
                </div>
              </Link>
            )}

            {/* HR & Payroll */}
            {hasHr && (
              <Link to="/hr" className="exec-card exec-card--purple">
                <div className="exec-card__header">HR & Payroll</div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Total Employees</span>
                  <span className="exec-card__value">{exec.hr.totalEmployees}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Active</span>
                  <span className="exec-card__value exec-card__value--green">{exec.hr.activeEmployees}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Payroll Gross</span>
                  <span className="exec-card__value">{formatPeso(exec.hr.totalPayrollGross)}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Net Pay</span>
                  <span className="exec-card__value">{formatPeso(exec.hr.totalPayrollNet)}</span>
                </div>
                <div className="exec-card__footer">
                  <span>{exec.hr.paidPayrollRuns} payroll runs paid</span>
                  {exec.hr.onLeave > 0 && (
                    <span className="exec-card__tag--warn">{exec.hr.onLeave} on leave</span>
                  )}
                </div>
              </Link>
            )}

            {/* Inventory */}
            {hasInventory && (
              <Link to="/inventory" className="exec-card exec-card--amber">
                <div className="exec-card__header">Inventory</div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Total Items</span>
                  <span className="exec-card__value">{exec.inventory.totalItems}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Total Value</span>
                  <span className="exec-card__value">{formatPeso(exec.inventory.totalValue)}</span>
                </div>
                {exec.inventory.belowReorder > 0 && (
                  <div className="exec-card__row">
                    <span className="exec-card__label">Below Reorder</span>
                    <span className="exec-card__value exec-card__value--red">{exec.inventory.belowReorder}</span>
                  </div>
                )}
              </Link>
            )}

            {/* Accounting */}
            {hasAccounting && (
              <Link to="/accounting" className="exec-card exec-card--slate">
                <div className="exec-card__header">Accounting</div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Posted JEVs</span>
                  <span className="exec-card__value">{exec.accounting.postedJevs}</span>
                </div>
                <div className="exec-card__row">
                  <span className="exec-card__label">Total Debits</span>
                  <span className="exec-card__value">{formatPeso(exec.accounting.totalDebits)}</span>
                </div>
              </Link>
            )}
          </div>

          {/* Recent JEVs table */}
          {hasAccounting && exec.accounting.recentJevs.length > 0 && (
            <div className="exec-jevs">
              <h3 className="exec-jevs__title">Recent Journal Entry Vouchers</h3>
              <table className="exec-jevs__table">
                <thead>
                  <tr>
                    <th>JEV #</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Source</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {exec.accounting.recentJevs.map((j) => (
                    <tr key={j.id}>
                      <td className="exec-jevs__mono">{j.jevNumber}</td>
                      <td>{fmtDate(j.jevDate)}</td>
                      <td className="exec-jevs__desc">{j.particulars}</td>
                      <td><span className="exec-jevs__source">{j.sourceType}</span></td>
                      <td className="exec-jevs__mono" style={{ textAlign: 'right' }}>{formatPeso(j.totalDebit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      {stats.length > 0 && (
        <div className="dashboard__stats">
          {stats.map((s) => {
            const clickable = s.value > 0 && s.link;
            const content = (
              <>
                <div className="dashboard__stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="dashboard__stat-label">{s.label}</div>
              </>
            );
            return clickable ? (
              <Link key={s.label} to={s.link!} className="dashboard__stat-card dashboard__stat-card--clickable">
                {content}
              </Link>
            ) : (
              <div key={s.label} className="dashboard__stat-card">
                {content}
              </div>
            );
          })}
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
