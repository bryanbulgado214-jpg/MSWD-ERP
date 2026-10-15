import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getDashboard, getWorkOrders } from '../api';
import type { WorkOrder, WorkOrderDashboard } from '../types';
import { WO_PRIORITY_LABELS, WO_STATUS_LABELS, WO_TYPE_LABELS } from '../types';
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../types';
import '../../../app/dashboard.css';
import '../workorders.css';

// Action categories for the section-head "what needs me" view, folded in from
// the former Home dashboard.
type ActionKind = 'assign' | 'dispatch' | 'complete' | 'awaiting' | 'info';

const OPEN_DONE: WorkOrderStatus[] = ['completed', 'verified', 'cancelled'];

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WorkOrderDashboardPage() {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<WorkOrderDashboard | null>(null);
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canAssignTech = hasPermission('workorder.assign.technical');
  const canAssignCommercial = hasPermission('workorder.assign.commercial');
  const canExecute = hasPermission('workorder.execute');
  // Section heads (Technical / Commercial) get the actionable "what needs me"
  // view folded in from the old Home; everyone else sees the stats alone.
  const isSectionHead = canAssignTech || canAssignCommercial;
  const sectionLabel = canAssignTech ? 'Technical Services' : 'Commercial Services';

  useEffect(() => {
    const jobs: Promise<unknown>[] = [getDashboard().then(setData)];
    if (isSectionHead) jobs.push(getWorkOrders('').then(setWos));
    Promise.all(jobs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  function canAssignWO(w: WorkOrder): boolean {
    return w.nature === 'technical' ? canAssignTech : canAssignCommercial;
  }
  function otherSectionFor(w: WorkOrder): string {
    return w.nature === 'technical' ? 'Technical Services' : 'Commercial Services';
  }
  function kindFor(w: WorkOrder): ActionKind {
    if (w.status === 'pending') return canAssignWO(w) ? 'assign' : 'awaiting';
    if (w.status === 'assigned') return canExecute ? 'dispatch' : 'info';
    if (w.status === 'in_progress') return canExecute ? 'complete' : 'info';
    return 'info';
  }
  function noteFor(w: WorkOrder): string {
    const t = WO_TYPE_LABELS[w.type as WorkOrderType] ?? w.type;
    switch (kindFor(w)) {
      case 'assign':
        return `${t} — needs crew assignment and your approval before it can be dispatched.`;
      case 'awaiting':
        return `${t} — awaiting ${otherSectionFor(w)} approval and assignment of personnel.`;
      case 'dispatch':
        return `${t} — crew assigned; ready to dispatch to the field.`;
      case 'complete':
        return `${t} — crew dispatched; awaiting the field completion report.`;
      default:
        return `${t} — ${WO_STATUS_LABELS[w.status]}.`;
    }
  }

  // A work order is "mine" if it falls under my section (I can assign its crew)
  // or I created it (e.g. a technical task Commercial initiated for Technical).
  const relevant = useMemo(
    () =>
      wos.filter(
        (w) =>
          !OPEN_DONE.includes(w.status) &&
          (canAssignWO(w) || (user?.sub != null && w.createdBy === user.sub)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wos, canAssignTech, canAssignCommercial, user?.sub],
  );

  const pending = relevant.filter((w) => ['assign', 'dispatch', 'complete'].includes(kindFor(w)));
  const notes = relevant.filter((w) => ['awaiting', 'info'].includes(kindFor(w)));
  const dated = [...relevant]
    .filter((w) => w.scheduledDate)
    .sort((a, b) => +new Date(a.scheduledDate!) - +new Date(b.scheduledDate!));
  const t0 = startOfToday();

  const PILL: Record<ActionKind, { label: string; bg: string; fg: string }> = {
    assign: { label: 'Needs crew assignment', bg: '#fef3f2', fg: '#b42318' },
    dispatch: { label: 'Ready to dispatch', bg: '#eff8ff', fg: '#175cd3' },
    complete: { label: 'Awaiting completion', bg: '#fffaeb', fg: '#b54708' },
    awaiting: { label: 'Awaiting other section', bg: '#f2f4f7', fg: '#475467' },
    info: { label: '', bg: '#f2f4f7', fg: '#475467' },
  };

  if (loading) return <div className="wo-page"><p className="wo-loading">Loading dashboard...</p></div>;
  if (error) return <div className="wo-page"><div className="wo-error">{error}</div></div>;

  const statusOrder: WorkOrderStatus[] = [
    'pending',
    'assigned',
    'in_progress',
    'completed',
    'verified',
    'cancelled',
  ];
  const totalActive = data
    ? data.byStatus
        .filter((s) => !['verified', 'cancelled'].includes(s.status))
        .reduce((sum, s) => sum + s._count, 0)
    : 0;

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        {isSectionHead ? (
          <div>
            <h1>Welcome, {user?.fullName || user?.username || 'User'}</h1>
            <p style={{ margin: '4px 0 0', color: '#667085', fontSize: 14 }}>
              {sectionLabel} Section Head &middot; {today}
            </p>
          </div>
        ) : (
          <h1>Work Order Dashboard</h1>
        )}
      </div>

      {data && (
        <div className="wo-dash-cards">
          <Link to="/work-orders" className="wo-dash-card wo-dash-card--active wo-dash-card--link">
            <div className="wo-dash-card__value">{totalActive}</div>
            <div className="wo-dash-card__label">Active Work Orders</div>
          </Link>
          {statusOrder.map((s) => {
            const item = data.byStatus.find((x) => x.status === s);
            const count = item?._count ?? 0;
            return (
              <Link
                key={s}
                to={`/work-orders?status=${s}`}
                className={`wo-dash-card wo-dash-card--${s} wo-dash-card--link`}
              >
                <div className="wo-dash-card__value">{count}</div>
                <div className="wo-dash-card__label">{WO_STATUS_LABELS[s]}</div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Section-head actionable view (folded in from the old Home) ── */}
      {isSectionHead && (
        <>
          <div className="dashboard__section" style={{ marginTop: '1.5rem' }}>
            <h2 className="dashboard__section-title">
              Pending Items
              <span
                className={`dashboard__count-badge${pending.length === 0 ? ' dashboard__count-badge--zero' : ''}`}
              >
                {pending.length}
              </span>
            </h2>
            {pending.length === 0 ? (
              <div className="dashboard__empty">Nothing needs your action right now.</div>
            ) : (
              <div className="dashboard__actions-list">
                {pending.map((w) => {
                  const pill = PILL[kindFor(w)];
                  return (
                    <Link
                      key={w.id}
                      to={`/work-orders/${w.id}`}
                      className="dashboard__action-card dashboard__action-card--link"
                      style={{ borderLeft: `6px solid ${pill.fg}`, background: pill.bg }}
                    >
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 12,
                          background: pill.bg,
                          color: pill.fg,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {pill.label}
                      </span>
                      <div className="dashboard__action-body">
                        <div className="dashboard__action-label">
                          {w.woNumber} — {w.title}
                        </div>
                        <div className="dashboard__action-desc">{noteFor(w)}</div>
                      </div>
                      {w.scheduledDate && (
                        <span className="dashboard__action-amount" style={{ whiteSpace: 'nowrap' }}>
                          {fmtDate(w.scheduledDate)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="dashboard__section">
            <h2 className="dashboard__section-title">Notes</h2>
            {notes.length === 0 ? (
              <div className="dashboard__empty">No notes.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {notes.map((w) => (
                  <li key={w.id}>
                    <Link
                      to={`/work-orders/${w.id}`}
                      className="dashboard__row-link"
                      style={{ gap: 10, alignItems: 'baseline' }}
                    >
                      <span className="dashboard__row-link__no">{w.woNumber}</span>
                      <span style={{ fontSize: 13, color: '#475467' }}>{noteFor(w)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dashboard__section">
            <h2 className="dashboard__section-title">Due Dates</h2>
            {dated.length === 0 ? (
              <div className="dashboard__empty">No scheduled work orders.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {dated.map((w) => {
                  const d = new Date(w.scheduledDate!);
                  d.setHours(0, 0, 0, 0);
                  const diff = d.getTime() - t0;
                  const overdue = diff < 0;
                  const isToday = diff === 0;
                  const tag = overdue
                    ? { text: 'Overdue', bg: '#fef3f2', fg: '#b42318' }
                    : isToday
                      ? { text: 'Today', bg: '#fffaeb', fg: '#b54708' }
                      : { text: 'Upcoming', bg: '#f2f4f7', fg: '#475467' };
                  return (
                    <li key={w.id}>
                      <Link
                        to={`/work-orders/${w.id}`}
                        className="dashboard__row-link"
                        style={{ borderLeft: `6px solid ${tag.fg}`, background: tag.bg }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 12,
                            background: tag.bg,
                            color: tag.fg,
                            whiteSpace: 'nowrap',
                            minWidth: 72,
                            textAlign: 'center',
                          }}
                        >
                          {tag.text}
                        </span>
                        <span className="dashboard__row-link__no">{w.woNumber}</span>
                        <span style={{ fontSize: 13, color: '#344054', flex: 1 }}>{w.title}</span>
                        <span style={{ fontSize: 12, color: '#667085', whiteSpace: 'nowrap' }}>
                          {fmtDate(w.scheduledDate!)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {data && (
        <div className="wo-dash-grid" style={{ marginTop: '1.5rem' }}>
          <section className="wo-card">
            <h2 className="wo-card__title">By Type</h2>
            {data.byType.length > 0 ? (
              <div className="wo-dash-bars">
                {data.byType.map((t) => (
                  <div key={t.type} className="wo-dash-bar">
                    <span className={`wo-badge wo-badge--type-${t.type}`}>
                      {WO_TYPE_LABELS[t.type as WorkOrderType] ?? t.type}
                    </span>
                    <div className="wo-dash-bar__track">
                      <div
                        className="wo-dash-bar__fill"
                        style={{ width: `${Math.min(100, (t._count / Math.max(1, ...data.byType.map((x) => x._count))) * 100)}%` }}
                      />
                    </div>
                    <span className="wo-dash-bar__count">{t._count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wo-empty">No data</p>
            )}
          </section>

          <section className="wo-card">
            <h2 className="wo-card__title">Active by Priority</h2>
            {data.byPriority.length > 0 ? (
              <div className="wo-dash-bars">
                {data.byPriority.map((p) => (
                  <div key={p.priority} className="wo-dash-bar">
                    <span className={`wo-badge wo-badge--priority-${p.priority}`}>
                      {WO_PRIORITY_LABELS[p.priority as WorkOrderPriority] ?? p.priority}
                    </span>
                    <div className="wo-dash-bar__track">
                      <div
                        className="wo-dash-bar__fill wo-dash-bar__fill--priority"
                        style={{ width: `${Math.min(100, (p._count / Math.max(1, ...data.byPriority.map((x) => x._count))) * 100)}%` }}
                      />
                    </div>
                    <span className="wo-dash-bar__count">{p._count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wo-empty">No active work orders</p>
            )}
          </section>
        </div>
      )}

      {data && (
        <section className="wo-card" style={{ marginTop: '1.25rem' }}>
          <h2 className="wo-card__title">Recently Completed</h2>
          {data.recentCompleted.length > 0 ? (
            <div className="wo-table-wrap">
              <table className="wo-table">
                <thead>
                  <tr>
                    <th>WO #</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Completed</th>
                    <th>Materials Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCompleted.map((wo) => (
                    <tr key={wo.id}>
                      <td><Link to={`/work-orders/${wo.id}`} className="wo-link">{wo.woNumber}</Link></td>
                      <td>{wo.title}</td>
                      <td><span className={`wo-badge wo-badge--type-${wo.type}`}>{WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}</span></td>
                      <td><span className={`wo-badge wo-badge--status-${wo.status}`}>{WO_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status}</span></td>
                      <td>{wo.completedAt ? new Date(wo.completedAt).toLocaleDateString() : '—'}</td>
                      <td>{Number(wo.materialsCost).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="wo-empty">No completed work orders yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
