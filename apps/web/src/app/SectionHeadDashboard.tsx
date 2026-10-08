import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getWorkOrders } from '../modules/workorders/api';
import {
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderType,
} from '../modules/workorders/types';

import { useAuth } from './auth';
import './dashboard.css';

/**
 * Home dashboard for the Technical / Commercial Services Section Heads. These
 * users will span several modules over time; for now it surfaces their Work
 * Orders as three lists — Pending Items (what needs their action), Notes
 * (status / things waiting on another section) and Due Dates. The same shell
 * can later fold in other modules as those heads gain access.
 */

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

export function SectionHeadDashboard() {
  const { user, hasPermission } = useAuth();
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canAssignTech = hasPermission('workorder.assign.technical');
  const canAssignCommercial = hasPermission('workorder.assign.commercial');
  const canExecute = hasPermission('workorder.execute');
  const sectionLabel = canAssignTech ? 'Technical Services' : 'Commercial Services';

  useEffect(() => {
    getWorkOrders('')
      .then(setWos)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load work orders'))
      .finally(() => setLoading(false));
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

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__greeting">Welcome, {user?.fullName || user?.username || 'User'}</h1>
        <p className="dashboard__date">
          {sectionLabel} Section Head &middot; {today}
        </p>
      </div>

      {error && <div className="wo-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ── Pending Items ── */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">
          Pending Items
          <span
            className={`dashboard__count-badge${pending.length === 0 ? ' dashboard__count-badge--zero' : ''}`}
          >
            {loading ? '...' : pending.length}
          </span>
        </h2>

        {loading && <div className="dashboard__loading">Loading work orders…</div>}
        {!loading && pending.length === 0 && (
          <div className="dashboard__empty">Nothing needs your action right now.</div>
        )}
        {!loading && pending.length > 0 && (
          <div className="dashboard__actions-list">
            {pending.map((w) => {
              const k = kindFor(w);
              const pill = PILL[k];
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

      {/* ── Notes ── */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">Notes</h2>
        {!loading && notes.length === 0 && (
          <div className="dashboard__empty">No notes.</div>
        )}
        {!loading && notes.length > 0 && (
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

      {/* ── Due Dates ── */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">Due Dates</h2>
        {!loading && dated.length === 0 && (
          <div className="dashboard__empty">No scheduled work orders.</div>
        )}
        {!loading && dated.length > 0 && (
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

      {/* ── Quick links ── */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">Modules</h2>
        <div className="dashboard__modules">
          <Link to="/work-orders" className="dashboard__module-card">
            <span className="dashboard__module-icon">{'\u{1F6E0}'}</span>
            <span className="dashboard__module-name">Work Orders</span>
            <span className="dashboard__module-desc">
              Create, assign crew, dispatch and complete field work orders.
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
