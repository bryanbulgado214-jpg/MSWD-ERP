import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { isCashierHome } from '../../../app/module-access';
import { PendingActions } from '../../../app/PendingActions';
import { WorkspacePanel } from '../../../app/WorkspacePanel';
import {
  getBillingSummary,
  getAgingReport,
  getCollectionSummary,
  getConsumers,
  getDisconnectionOrders,
} from '../api';

import BillingSubNav from './BillingSubNav';
import './billing.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

interface DashboardData {
  consumerCount: number;
  activeConsumers: number;
  billingSummary: {
    totalBills: number;
    totalBilled: number;
    totalCollected: number;
    totalBalance: number;
    totalConsumption: number;
    collectionRate: number;
    byStatus: Array<{ status: string; count: number; amount: number }>;
  } | null;
  agingSummary: Array<{ bracket: string; count: number; total: number }>;
  totalOutstanding: number;
  recentCollections: { totalCollected: number; paymentCount: number } | null;
  pendingDisconnections: number;
}

export default function BillingDashboardPage() {
  const { hasPermission, permissions } = useAuth();
  const cashierHome = isCashierHome(permissions);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const results: DashboardData = {
          consumerCount: 0,
          activeConsumers: 0,
          billingSummary: null,
          agingSummary: [],
          totalOutstanding: 0,
          recentCollections: null,
          pendingDisconnections: 0,
        };

        const [consumers, summary, aging, disconnections] = await Promise.allSettled([
          getConsumers(),
          hasPermission('billing.reports') ? getBillingSummary() : Promise.resolve(null),
          hasPermission('billing.reports') ? getAgingReport() : Promise.resolve(null),
          hasPermission('billing.disconnect.manage')
            ? getDisconnectionOrders('status=notice_issued')
            : Promise.resolve([]),
        ]);

        if (consumers.status === 'fulfilled') {
          results.consumerCount = consumers.value.length;
          results.activeConsumers = consumers.value.filter((c) => c.status === 'active').length;
        }

        if (summary.status === 'fulfilled' && summary.value) {
          results.billingSummary = summary.value as DashboardData['billingSummary'];
        }

        if (aging.status === 'fulfilled' && aging.value) {
          const a = aging.value as {
            summary: DashboardData['agingSummary'];
            totalOutstanding: number;
          };
          results.agingSummary = a.summary;
          results.totalOutstanding = a.totalOutstanding;
        }

        if (disconnections.status === 'fulfilled') {
          results.pendingDisconnections = (disconnections.value as unknown[]).length;
        }

        // Get this month's collections
        if (hasPermission('billing.reports')) {
          try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
              .toISOString()
              .slice(0, 10);
            const today = now.toISOString().slice(0, 10);
            const col = (await getCollectionSummary(startOfMonth, today)) as {
              totalCollected: number;
              paymentCount: number;
            };
            results.recentCollections = col;
          } catch {
            /* ignore */
          }
        }

        setData(results);
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading)
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-loading">Loading dashboard...</div>
      </div>
    );
  if (!data)
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-error">Failed to load dashboard data.</div>
      </div>
    );

  const collRate = data.billingSummary?.collectionRate ?? 0;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>{cashierHome ? 'Cashiering Dashboard' : 'Billing Dashboard'}</h1>

      {/* What needs the cashier's action — pinned to the top. Always shown for
          the cashier (like the Accounting Dashboard); hidden-when-empty for others. */}
      <PendingActions hideWhenEmpty={!cashierHome} />

      {/* Personal notes + upcoming due dates (same as the Accounting Dashboard). */}
      {cashierHome && <WorkspacePanel />}

      {/* KPI Cards */}
      <div className="bill-dash-grid">
        <div className="bill-dash-card bill-dash-card--blue">
          <div className="bill-dash-card__label">Total Consumers</div>
          <div className="bill-dash-card__value">{data.consumerCount}</div>
          <div className="bill-dash-card__sub">{data.activeConsumers} active</div>
          <Link to="/billing/consumers" className="bill-dash-card__link">
            View all
          </Link>
        </div>

        <div className="bill-dash-card bill-dash-card--green">
          <div className="bill-dash-card__label">Total Collected</div>
          <div className="bill-dash-card__value">
            {formatPeso(data.billingSummary?.totalCollected ?? 0)}
          </div>
          <div className="bill-dash-card__sub">{collRate.toFixed(1)}% collection rate</div>
          <Link to="/billing/payments" className="bill-dash-card__link">
            Payments
          </Link>
        </div>

        <div className="bill-dash-card bill-dash-card--red">
          <div className="bill-dash-card__label">Outstanding Balance</div>
          <div className="bill-dash-card__value">{formatPeso(data.totalOutstanding)}</div>
          <div className="bill-dash-card__sub">
            {data.billingSummary?.totalBills ?? 0} total bills
          </div>
          <Link to="/billing/bills" className="bill-dash-card__link">
            View bills
          </Link>
        </div>

        <div className="bill-dash-card bill-dash-card--amber">
          <div className="bill-dash-card__label">This Month Collections</div>
          <div className="bill-dash-card__value">
            {formatPeso(data.recentCollections?.totalCollected ?? 0)}
          </div>
          <div className="bill-dash-card__sub">
            {data.recentCollections?.paymentCount ?? 0} payments
          </div>
          <Link to="/billing/reports" className="bill-dash-card__link">
            Reports
          </Link>
        </div>
      </div>

      {/* Aging Summary + Quick Actions */}
      <div className="bill-dash-row">
        <div className="bill-dash-panel">
          <h3 className="bill-section-title">Aging Summary</h3>
          {data.agingSummary.length > 0 ? (
            <table className="bill-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Bracket</th>
                  <th style={{ textAlign: 'right' }}>Bills</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.agingSummary.map((s) => (
                  <tr key={s.bracket}>
                    <td>{s.bracket === 'current' ? 'Current' : `${s.bracket} days`}</td>
                    <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                      {s.count}
                    </td>
                    <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                      {formatPeso(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>Total</td>
                  <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                    {data.agingSummary.reduce((s, a) => s + a.count, 0)}
                  </td>
                  <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                    {formatPeso(data.totalOutstanding)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="bill-empty">No outstanding bills.</div>
          )}
        </div>

        <div className="bill-dash-panel">
          <h3 className="bill-section-title">Quick Actions</h3>
          <div className="bill-dash-actions">
            {hasPermission('billing.payment.collect') && (
              <Link to="/billing/payments" className="bill-dash-action-btn">
                Collect Payment
              </Link>
            )}
            {hasPermission('billing.read') && (
              <Link to="/billing/readings" className="bill-dash-action-btn">
                Record Reading
              </Link>
            )}
            {hasPermission('billing.manage') && (
              <Link to="/billing/consumers" className="bill-dash-action-btn">
                Add Consumer
              </Link>
            )}
            {hasPermission('billing.reports') && (
              <Link to="/billing/reports" className="bill-dash-action-btn">
                Generate Report
              </Link>
            )}
            {hasPermission('billing.disconnect.manage') && (
              <Link to="/billing/disconnections" className="bill-dash-action-btn">
                Disconnections{' '}
                {data.pendingDisconnections > 0 && (
                  <span className="bill-badge bill-badge--notice_issued">
                    {data.pendingDisconnections}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Billing Status Breakdown */}
      {data.billingSummary && data.billingSummary.byStatus.length > 0 && (
        <div className="bill-dash-panel" style={{ marginTop: 20 }}>
          <h3 className="bill-section-title">Bill Status Breakdown</h3>
          <div className="bill-dash-status-bar">
            {data.billingSummary.byStatus.map((s) => {
              const pct =
                data.billingSummary!.totalBills > 0
                  ? (s.count / data.billingSummary!.totalBills) * 100
                  : 0;
              return (
                <div
                  key={s.status}
                  className={`bill-dash-status-seg bill-dash-status-seg--${s.status}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                  title={`${s.status}: ${s.count} bills (${formatPeso(s.amount)})`}
                >
                  {pct >= 10 && <span>{s.status}</span>}
                </div>
              );
            })}
          </div>
          <div className="bill-dash-status-legend">
            {data.billingSummary.byStatus.map((s) => (
              <div key={s.status} className="bill-dash-status-legend__item">
                <span className={`bill-badge bill-badge--${s.status}`}>{s.status}</span>
                <span className="bill-text-mono">{s.count}</span>
                <span className="bill-text-mono">{formatPeso(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consumption stats */}
      {data.billingSummary && (
        <div className="bill-dash-panel" style={{ marginTop: 20 }}>
          <h3 className="bill-section-title">Consumption Summary</h3>
          <div className="bill-dash-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div style={{ textAlign: 'center', padding: '12px' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#667085',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Total Consumption
              </div>
              <div
                style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
              >
                {data.billingSummary.totalConsumption.toLocaleString()} cu.m.
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#667085',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Avg per Bill
              </div>
              <div
                style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
              >
                {data.billingSummary.totalBills > 0
                  ? (data.billingSummary.totalConsumption / data.billingSummary.totalBills).toFixed(
                      1,
                    )
                  : '0'}{' '}
                cu.m.
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#667085',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Avg Bill Amount
              </div>
              <div
                style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
              >
                {formatPeso(
                  data.billingSummary.totalBills > 0
                    ? data.billingSummary.totalBilled / data.billingSummary.totalBills
                    : 0,
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
