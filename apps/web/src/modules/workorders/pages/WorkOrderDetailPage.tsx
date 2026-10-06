import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  assignCrew,
  cancelWorkOrder,
  completeWorkOrder,
  dispatchWorkOrder,
  getWorkOrder,
  listPersonnel,
  listTeams,
} from '../api';
import {
  WO_NATURE_LABELS,
  WO_PRIORITY_LABELS,
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  type WorkOrder,
  type WorkOrderPersonnel,
  type WorkOrderTeam,
  type WorkOrderType,
} from '../types';
import '../workorders.css';

function fmtDateTime(s: string | null): string {
  return s ? new Date(s).toLocaleString() : '—';
}
function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : '—';
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  // action panels
  const [panel, setPanel] = useState<'' | 'assign' | 'complete' | 'cancel'>('');
  const [personnel, setPersonnel] = useState<WorkOrderPersonnel[]>([]);
  const [teams, setTeams] = useState<WorkOrderTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [tasksPerformed, setTasksPerformed] = useState('');
  const [issues, setIssues] = useState('');
  const [remarks, setRemarks] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    getWorkOrder(id)
      .then(setWo)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listPersonnel().then(setPersonnel).catch(() => {});
    listTeams().then(setTeams).catch(() => {});
  }, []);

  if (error && !wo) return <div className="wo-page"><div className="wo-error">{error}</div></div>;
  if (!wo) return <div className="wo-page"><div className="wo-loading">Loading…</div></div>;

  const canAssign = hasPermission(
    wo.nature === 'technical' ? 'workorder.assign.technical' : 'workorder.assign.commercial',
  );
  const canExecute = hasPermission('workorder.execute');
  const canEdit = hasPermission('workorder.create');

  function openAssign() {
    if (!wo) return;
    setTeamId(wo.teamId ?? '');
    setLeaderId(wo.teamLeaderId ?? '');
    setMemberIds((wo.members ?? []).map((m) => m.personnelId));
    setError('');
    setPanel('assign');
  }
  function applyTeam(tid: string) {
    setTeamId(tid);
    const team = teams.find((t) => t.id === tid);
    if (team) {
      setLeaderId(team.leaderId ?? '');
      setMemberIds((team.members ?? []).map((m) => m.personnel.id));
    }
  }
  function toggleMember(pid: string) {
    setMemberIds((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]));
  }

  async function run(fn: () => Promise<WorkOrder>) {
    setActing(true);
    setError('');
    try {
      const updated = await fn();
      setWo(updated);
      setPanel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  const doAssign = () =>
    run(() =>
      assignCrew(wo.id, {
        expectedVersion: wo.version,
        ...(teamId ? { teamId } : {}),
        teamLeaderId: leaderId,
        memberIds: [...new Set([leaderId, ...memberIds])],
      }),
    );
  const doDispatch = () => run(() => dispatchWorkOrder(wo.id, { expectedVersion: wo.version }));
  const doComplete = () =>
    run(() =>
      completeWorkOrder(wo.id, {
        expectedVersion: wo.version,
        tasksPerformed,
        issuesEncountered: issues,
        remarks,
      }),
    );
  const doCancel = () =>
    run(() => cancelWorkOrder(wo.id, { expectedVersion: wo.version, reason: cancelReason }));

  const members = wo.members ?? [];
  const customerDisplay =
    wo.customerName ||
    (wo.consumer ? `${wo.consumer.firstName} ${wo.consumer.lastName} (${wo.consumer.accountNumber})` : '—');

  return (
    <div className="wo-page">
      <Link to="/work-orders" className="wo-link">&larr; Back to Work Orders</Link>
      <div className="wo-page__header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{wo.woNumber}</h1>
        <span className={`wo-badge wo-badge--status-${wo.status}`}>{WO_STATUS_LABELS[wo.status]}</span>
        <span
          className="wo-badge"
          style={{ background: wo.nature === 'technical' ? '#fef3f2' : '#ecfdf3', color: wo.nature === 'technical' ? '#b42318' : '#067647' }}
        >
          {WO_NATURE_LABELS[wo.nature]}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to={`/work-orders/${wo.id}/print`} className="wo-btn wo-btn--sm">Print</Link>
          {canEdit && ['draft', 'pending', 'assigned'].includes(wo.status) && (
            <Link to={`/work-orders/${wo.id}/edit`} className="wo-btn wo-btn--sm">Edit</Link>
          )}
        </div>
      </div>

      {error && <div className="wo-error">{error}</div>}

      {/* Actions */}
      <div className="wo-actions" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['pending', 'assigned'].includes(wo.status) && canAssign && (
          <button className="wo-btn wo-btn--primary" onClick={openAssign} disabled={acting}>
            {wo.status === 'assigned' ? 'Reassign Crew' : 'Assign Crew'}
          </button>
        )}
        {wo.status === 'assigned' && canExecute && (
          <button className="wo-btn wo-btn--primary" onClick={doDispatch} disabled={acting}>
            Dispatch (record time out)
          </button>
        )}
        {wo.status === 'in_progress' && canExecute && (
          <button className="wo-btn wo-btn--success" onClick={() => setPanel('complete')} disabled={acting}>
            Complete
          </button>
        )}
        {!['completed', 'verified', 'cancelled'].includes(wo.status) && canEdit && (
          <button className="wo-btn wo-btn--danger" onClick={() => setPanel('cancel')} disabled={acting}>
            Cancel
          </button>
        )}
      </div>

      {/* Assign crew panel */}
      {panel === 'assign' && (
        <div className="wo-crew-box" style={{ marginBottom: 16 }}>
          <h3 className="wo-crew-box__title">Assign Crew</h3>
          <div className="wo-form__grid">
            <label className="wo-form__field">
              <span className="wo-form__label">Use a team</span>
              <select className="wo-select" value={teamId} onChange={(e) => applyTeam(e.target.value)}>
                <option value="">— Pick a team (prefills) —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="wo-form__field">
              <span className="wo-form__label">Team Leader *</span>
              <select className="wo-select" value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
                <option value="">— Select leader —</option>
                {personnel.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.designation ? ` — ${p.designation}` : ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Members</span>
            <div className="wo-member-grid">
              {personnel.map((p) => (
                <label key={p.id} className="wo-member-chip">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(p.id) || p.id === leaderId}
                    disabled={p.id === leaderId}
                    onChange={() => toggleMember(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div className="wo-form__actions">
            <button className="wo-btn" onClick={() => setPanel('')}>Cancel</button>
            <button className="wo-btn wo-btn--primary" onClick={doAssign} disabled={acting || !leaderId}>
              {acting ? 'Saving…' : 'Assign'}
            </button>
          </div>
        </div>
      )}

      {/* Complete panel */}
      {panel === 'complete' && (
        <div className="wo-complete-form" style={{ marginBottom: 16, padding: 16, border: '1px solid #e4e7ec', borderRadius: 10, background: '#f9fafb' }}>
          <h3 style={{ marginTop: 0 }}>Complete Work Order</h3>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Tasks performed</span>
            <textarea className="wo-textarea" rows={3} value={tasksPerformed} onChange={(e) => setTasksPerformed(e.target.value)} />
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Issues encountered</span>
            <textarea className="wo-textarea" rows={2} value={issues} onChange={(e) => setIssues(e.target.value)} />
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Remarks</span>
            <textarea className="wo-textarea" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          <span style={{ fontSize: 12, color: '#667085' }}>The time returned is recorded as now on completion.</span>
          <div className="wo-form__actions">
            <button className="wo-btn" onClick={() => setPanel('')}>Cancel</button>
            <button className="wo-btn wo-btn--success" onClick={doComplete} disabled={acting}>
              {acting ? 'Saving…' : 'Mark Completed'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel panel */}
      {panel === 'cancel' && (
        <div className="wo-cancel-form" style={{ marginBottom: 16, padding: 16, border: '1px solid #fecdca', borderRadius: 10, background: '#fef3f2' }}>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Reason for cancellation</span>
            <input className="wo-input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
          <div className="wo-form__actions">
            <button className="wo-btn" onClick={() => setPanel('')}>Back</button>
            <button className="wo-btn wo-btn--danger" onClick={doCancel} disabled={acting}>Confirm Cancel</button>
          </div>
        </div>
      )}

      <div className="wo-detail__grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="wo-card">
          <div className="wo-card__title">Details</div>
          <dl className="wo-kv">
            <dt>Task Type</dt><dd>{WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}</dd>
            <dt>Nature</dt><dd>{WO_NATURE_LABELS[wo.nature]}</dd>
            <dt>Priority</dt><dd>{WO_PRIORITY_LABELS[wo.priority]}</dd>
            <dt>Title</dt><dd>{wo.title}</dd>
            <dt>Customer</dt><dd>{customerDisplay}</dd>
            <dt>Location</dt><dd>{wo.location || '—'}</dd>
            <dt>Scheduled</dt><dd>{fmtDate(wo.scheduledDate)}</dd>
            <dt>Customer signature</dt><dd>{wo.customerSignatureRequired ? 'Required' : 'Not required'}</dd>
            <dt>Description</dt><dd>{wo.description || '—'}</dd>
            <dt>Instructions</dt><dd>{wo.instructions || '—'}</dd>
          </dl>
        </div>

        <div className="wo-card">
          <div className="wo-card__title">Crew</div>
          <dl className="wo-kv">
            <dt>Team</dt><dd>{wo.team?.name || '—'}</dd>
            <dt>Team Leader</dt><dd>{wo.teamLeader?.name || '—'}</dd>
            <dt>Members</dt>
            <dd>
              {members.length
                ? members.map((m) => `${m.personnel?.name ?? ''}${m.isLeader ? ' (leader)' : ''}`).join(', ')
                : '—'}
            </dd>
            <dt>Assigned by</dt><dd>{wo.crewAssigner?.username || '—'} {wo.assignedCrewAt ? `· ${fmtDateTime(wo.assignedCrewAt)}` : ''}</dd>
          </dl>
          <div className="wo-card__title" style={{ marginTop: 16 }}>Field Execution</div>
          <dl className="wo-kv">
            <dt>Time out (left)</dt><dd>{fmtDateTime(wo.timeLeft)}</dd>
            <dt>Time returned</dt><dd>{fmtDateTime(wo.timeReturned)}</dd>
            <dt>Tasks performed</dt><dd>{wo.tasksPerformed || '—'}</dd>
            <dt>Issues encountered</dt><dd>{wo.issuesEncountered || '—'}</dd>
            <dt>Remarks</dt><dd>{wo.remarks || '—'}</dd>
          </dl>
        </div>
      </div>

      <div className="wo-meta" style={{ marginTop: 16, fontSize: 12, color: '#667085' }}>
        Created by {wo.creator?.username ?? '—'} on {fmtDateTime(wo.createdAt)}
      </div>
    </div>
  );
}
