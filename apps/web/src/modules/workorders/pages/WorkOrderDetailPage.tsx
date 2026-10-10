import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  assignCrew,
  cancelWorkOrder,
  completeCrew,
  dispatchCrew,
  getWorkOrder,
  listPersonnel,
  listStaff,
  listTeams,
} from '../api';
import MemberPickerModal from '../components/MemberPickerModal';
import {
  STAFF_STATUS_LABELS,
  WO_CREW_STATUS_LABELS,
  WO_NATURE_LABELS,
  WO_PRIORITY_LABELS,
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  type StaffAvailabilityStatus,
  type WorkOrder,
  type WorkOrderCrew,
  type WorkOrderPersonnel,
  type WorkOrderTeam,
  type WorkOrderType,
} from '../types';

interface CrewDraft {
  solo: boolean;
  teamId: string;
  leaderId: string;
  memberIds: string[];
}
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
  const [solo, setSolo] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [staffStatus, setStaffStatus] = useState<Map<string, StaffAvailabilityStatus>>(new Map());
  const [tasksPerformed, setTasksPerformed] = useState('');
  const [issues, setIssues] = useState('');
  const [remarks, setRemarks] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  // Crews staged for this work order (each a leader + members); the builder
  // below them holds the crew currently being put together.
  const [stagedCrews, setStagedCrews] = useState<CrewDraft[]>([]);
  // When completing the final crew, this holds it so the completion report is
  // saved to the work order.
  const [completingCrew, setCompletingCrew] = useState<WorkOrderCrew | null>(null);

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
    // Map each linked field personnel to their current availability so the member
    // picker can show status and filter to "Available only".
    listStaff()
      .then((staff) => {
        const m = new Map<string, StaffAvailabilityStatus>();
        for (const s of staff) {
          if (s.workOrderPersonnelId) m.set(s.workOrderPersonnelId, s.status);
        }
        setStaffStatus(m);
      })
      .catch(() => {});
  }, []);

  if (error && !wo) return <div className="wo-page"><div className="wo-error">{error}</div></div>;
  if (!wo) return <div className="wo-page"><div className="wo-loading">Loading…</div></div>;

  const canAssign = hasPermission(
    wo.nature === 'technical' ? 'workorder.assign.technical' : 'workorder.assign.commercial',
  );
  const canEdit = hasPermission('workorder.create');

  function resetBuilder() {
    setSolo(false);
    setTeamId('');
    setLeaderId('');
    setMemberIds([]);
  }
  function openAssign() {
    if (!wo) return;
    // Pre-load the existing crews so a re-assign keeps them; build any new crew
    // in the empty builder below.
    const existing = (wo.crews ?? []).filter((c) => c.status !== 'cancelled');
    if (existing.length) {
      setStagedCrews(
        existing.map((c) => ({
          solo: c.soloTask,
          teamId: c.teamId ?? '',
          leaderId: c.teamLeaderId ?? '',
          memberIds: c.members.filter((m) => !m.isLeader).map((m) => m.personnelId),
        })),
      );
    } else if (wo.teamLeaderId) {
      setStagedCrews([
        {
          solo: wo.soloTask,
          teamId: wo.teamId ?? '',
          leaderId: wo.teamLeaderId,
          memberIds: (wo.members ?? []).filter((m) => !m.isLeader).map((m) => m.personnelId),
        },
      ]);
    } else {
      setStagedCrews([]);
    }
    resetBuilder();
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
  function addAnotherCrew() {
    if (!leaderId) {
      setError('Pick a leader for this crew before adding another.');
      return;
    }
    setStagedCrews((prev) => [...prev, { solo, teamId, leaderId, memberIds }]);
    resetBuilder();
    setError('');
  }
  function removeStagedCrew(i: number) {
    setStagedCrews((prev) => prev.filter((_, x) => x !== i));
  }

  // A personnel option for the leader / solo picker. Someone who isn't available
  // (on field work, on leave, unavailable) can't be picked — they're disabled and
  // labelled with their status.
  function personnelOption(p: WorkOrderPersonnel) {
    const st = staffStatus.get(p.id);
    const unavailable = st !== undefined && st !== 'available';
    return (
      <option key={p.id} value={p.id} disabled={unavailable}>
        {p.name}
        {p.designation ? ` — ${p.designation}` : ''}
        {st && st !== 'available' ? ` — ${STAFF_STATUS_LABELS[st]}` : ''}
      </option>
    );
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

  const doAssign = () => {
    if (!wo) return;
    const drafts: CrewDraft[] = [...stagedCrews];
    if (leaderId) drafts.push({ solo, teamId, leaderId, memberIds });
    if (!drafts.length) {
      setError('Add at least one crew with a leader.');
      return;
    }
    return run(() =>
      assignCrew(wo.id, {
        expectedVersion: wo.version,
        crews: drafts.map((c) => ({
          soloTask: c.solo,
          ...(c.teamId && !c.solo ? { teamId: c.teamId } : {}),
          teamLeaderId: c.leaderId,
          memberIds: c.solo ? [] : c.memberIds.filter((m) => m !== c.leaderId),
        })),
      }),
    );
  };
  const doDispatchCrew = (crewId: string) =>
    run(() => dispatchCrew(wo.id, crewId, { expectedVersion: wo.version }));
  const openCrews = (wo.crews ?? []).filter(
    (c) => c.status === 'assigned' || c.status === 'dispatched',
  );
  function clickCompleteCrew(crew: WorkOrderCrew) {
    if (!wo) return;
    if (openCrews.length <= 1) {
      // Last crew out — collect the work order's completion report.
      setCompletingCrew(crew);
      setTasksPerformed('');
      setIssues('');
      setRemarks('');
      setError('');
      setPanel('complete');
    } else {
      run(() => completeCrew(wo.id, crew.id, { expectedVersion: wo.version }));
    }
  }
  const doCompleteCrew = () => {
    if (!wo || !completingCrew) return;
    return run(() =>
      completeCrew(wo.id, completingCrew.id, {
        expectedVersion: wo.version,
        tasksPerformed,
        issuesEncountered: issues,
        remarks,
      }),
    );
  };
  const doCancel = () =>
    run(() => cancelWorkOrder(wo.id, { expectedVersion: wo.version, reason: cancelReason }));

  // A technical work order sits in "pending" until the Technical Services
  // Section Head assigns the crew (which moves it to "assigned"). While it is
  // still pending with no crew, show a note — this is typically a technical
  // task that Commercial initiated and that Technical has yet to act on.
  const awaitingTechApproval =
    wo.nature === 'technical' && wo.status === 'pending' && !wo.teamLeaderId;

  const crews = wo.crews ?? [];
  // People already placed on a staged crew can't be picked again for the crew
  // being built (one crew per person on a work order).
  const stagedPersonnelIds = new Set<string>();
  for (const c of stagedCrews) {
    if (c.leaderId) stagedPersonnelIds.add(c.leaderId);
    for (const m of c.memberIds) stagedPersonnelIds.add(m);
  }
  const builderPersonnel = personnel.filter((p) => !stagedPersonnelIds.has(p.id));
  const CREW_STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
    assigned: { bg: '#f2f4f7', fg: '#475467' },
    dispatched: { bg: '#eff8ff', fg: '#175cd3' },
    completed: { bg: '#ecfdf3', fg: '#067647' },
    cancelled: { bg: '#fef3f2', fg: '#b42318' },
  };
  const customerDisplay =
    wo.customerName ||
    (wo.consumer ? `${wo.consumer.firstName} ${wo.consumer.lastName} (${wo.consumer.accountNumber})` : '—');

  return (
    <div className="wo-page">
      <Link to="/work-orders" className="wo-back">
        <span className="wo-back__arrow" aria-hidden="true">&larr;</span>
        Back to Work Orders
      </Link>
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

      {awaitingTechApproval && (
        <div
          className="wo-pending-note"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            border: '1px solid #fde68a',
            background: '#fffbeb',
            borderRadius: 10,
            color: '#92400e',
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          <strong>Pending Technical Services approval.</strong> This work order is pending the
          approval of the Technical Services Section Head, including the assignment of personnel,
          before it can be dispatched to the field.
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
          <div className="wo-card__title">
            {crews.length > 1 ? `Crews (${crews.length})` : 'Crew'}
          </div>
          {crews.length === 0 ? (
            <p style={{ color: '#667085', fontSize: 13, margin: '4px 0' }}>No crew assigned yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {crews.map((c) => {
                const col = CREW_STATUS_COLOR[c.status] ?? CREW_STATUS_COLOR.assigned!;
                const crewMembers = c.members.filter((m) => !m.isLeader);
                return (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid #eaecf0',
                      borderRadius: 8,
                      padding: 12,
                      opacity: c.status === 'cancelled' ? 0.6 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>
                        {c.soloTask ? 'One-man task' : `Crew ${c.crewNumber}`}
                      </strong>
                      <span
                        className="wo-badge"
                        style={{ background: col.bg, color: col.fg, fontWeight: 700 }}
                      >
                        {WO_CREW_STATUS_LABELS[c.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: '#667085' }}>
                        {c.soloTask ? 'Personnel: ' : 'Leader: '}
                      </span>
                      {c.teamLeader?.name ?? '—'}
                    </div>
                    {!c.soloTask && (
                      <div style={{ fontSize: 13, marginTop: 2 }}>
                        <span style={{ color: '#667085' }}>Members: </span>
                        {crewMembers.length
                          ? crewMembers.map((m) => m.personnel?.name).filter(Boolean).join(', ')
                          : '—'}
                      </div>
                    )}
                    {(c.dispatchedAt || c.completedAt) && (
                      <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                        {c.dispatchedAt && <>Out: {fmtDateTime(c.timeLeft ?? c.dispatchedAt)}</>}
                        {c.completedAt && <> · Back: {fmtDateTime(c.timeReturned ?? c.completedAt)}</>}
                      </div>
                    )}
                    {canAssign && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {c.status === 'assigned' &&
                          ['assigned', 'in_progress'].includes(wo.status) && (
                            <button
                              className="wo-btn wo-btn--primary wo-btn--sm"
                              onClick={() => doDispatchCrew(c.id)}
                              disabled={acting}
                            >
                              Dispatch
                            </button>
                          )}
                        {c.status === 'dispatched' && (
                          <button
                            className="wo-btn wo-btn--success wo-btn--sm"
                            onClick={() => clickCompleteCrew(c)}
                            disabled={acting}
                          >
                            Mark complete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <dl className="wo-kv" style={{ marginTop: 12 }}>
            <dt>Assigned by</dt>
            <dd>
              {wo.crewAssigner?.username || '—'}{' '}
              {wo.assignedCrewAt ? `· ${fmtDateTime(wo.assignedCrewAt)}` : ''}
            </dd>
          </dl>
          <div className="wo-card__title" style={{ marginTop: 16 }}>Completion Report</div>
          <dl className="wo-kv">
            <dt>Tasks performed</dt><dd>{wo.tasksPerformed || '—'}</dd>
            <dt>Issues encountered</dt><dd>{wo.issuesEncountered || '—'}</dd>
            <dt>Remarks</dt><dd>{wo.remarks || '—'}</dd>
          </dl>
        </div>
      </div>

      {/* Actions (kept at the bottom, compact) */}
      <div
        className="wo-actions"
        style={{
          marginTop: 20,
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        {['pending', 'assigned', 'in_progress'].includes(wo.status) && canAssign && (
          <button className="wo-btn wo-btn--primary wo-btn--sm" onClick={openAssign} disabled={acting}>
            {crews.length ? 'Reassign Crews' : 'Assign Crew'}
          </button>
        )}
        {!['completed', 'verified', 'cancelled'].includes(wo.status) && canEdit && (
          <button className="wo-btn wo-btn--danger wo-btn--sm" onClick={() => setPanel('cancel')} disabled={acting}>
            Cancel
          </button>
        )}
      </div>

      {/* Assign crew panel */}
      {panel === 'assign' && (
        <div className="wo-crew-box" style={{ marginTop: 16 }}>
          <h3 className="wo-crew-box__title">Assign Crew{stagedCrews.length ? 's' : ''}</h3>

          {stagedCrews.length > 0 && (
            <div style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
              {stagedCrews.map((c, i) => {
                const lp = personnel.find((p) => p.id === c.leaderId);
                const mNames = c.memberIds
                  .filter((m) => m !== c.leaderId)
                  .map((m) => personnel.find((p) => p.id === m)?.name ?? '')
                  .filter(Boolean);
                return (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #eaecf0',
                      borderRadius: 8,
                      padding: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      <strong>{c.solo ? 'One-man task' : `Crew ${i + 1}`}</strong>
                      {' — '}
                      {c.solo ? '' : 'Leader: '}
                      {lp?.name ?? '—'}
                      {!c.solo && mNames.length > 0 && (
                        <span style={{ color: '#667085' }}> · {mNames.join(', ')}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="wo-btn wo-btn--danger wo-btn--sm"
                      onClick={() => removeStagedCrew(i)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {stagedCrews.length > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#175cd3', margin: '0 0 8px' }}>
              Add another crew
            </div>
          )}

          {/* Step 1 — is this a one-person job or a team task? */}
          <div className="wo-form__field" style={{ marginBottom: 12 }}>
            <span className="wo-form__label">Type of task</span>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="wo-crewtype" checked={solo} onChange={() => setSolo(true)} />
                One-man task <span style={{ color: '#667085', fontSize: 12 }}>(e.g. meter reading)</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="wo-crewtype" checked={!solo} onChange={() => setSolo(false)} />
                Team <span style={{ color: '#667085', fontSize: 12 }}>(leader + members)</span>
              </label>
            </div>
          </div>

          {solo ? (
            <label className="wo-form__field wo-form__field--full">
              <span className="wo-form__label">Assigned personnel *</span>
              <select className="wo-select" value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
                <option value="">— Select personnel —</option>
                {builderPersonnel.map(personnelOption)}
              </select>
            </label>
          ) : (
            <>
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
                    {builderPersonnel.map(personnelOption)}
                  </select>
                </label>
              </div>
              <div className="wo-form__field wo-form__field--full">
                <button
                  type="button"
                  className="wo-btn wo-btn--primary wo-btn--sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setMemberModalOpen(true)}
                >
                  + Add Members
                </button>
                <div className="wo-member-grid" style={{ marginTop: 8 }}>
                  {[...new Set([...(leaderId ? [leaderId] : []), ...memberIds])].map((pid) => {
                    const p = personnel.find((x) => x.id === pid);
                    const isLeader = pid === leaderId;
                    return (
                      <span key={pid} className="wo-member-chip" style={{ cursor: 'default' }}>
                        {p?.name ?? pid}
                        {isLeader ? ' (leader)' : ''}
                        {!isLeader && (
                          <button
                            type="button"
                            onClick={() => toggleMember(pid)}
                            title="Remove"
                            style={{
                              marginLeft: 6,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#b42318',
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {!leaderId && memberIds.length === 0 && (
                    <span style={{ fontSize: 12, color: '#667085' }}>No members added yet.</span>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="wo-form__actions" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="wo-btn" onClick={() => setPanel('')}>Cancel</button>
            <button
              type="button"
              className="wo-btn"
              onClick={addAnotherCrew}
              disabled={acting || !leaderId}
              title="Stage this crew and start another"
            >
              + Add another crew
            </button>
            <button
              className="wo-btn wo-btn--primary"
              onClick={doAssign}
              disabled={acting || (!leaderId && stagedCrews.length === 0)}
            >
              {acting
                ? 'Saving…'
                : `Assign ${stagedCrews.length + (leaderId ? 1 : 0) > 1 ? 'Crews' : 'Crew'}`}
            </button>
          </div>

          <MemberPickerModal
            open={memberModalOpen}
            onClose={() => setMemberModalOpen(false)}
            personnel={builderPersonnel}
            leaderId={leaderId}
            selectedIds={memberIds}
            onToggle={toggleMember}
            statusByPersonnel={staffStatus}
          />
        </div>
      )}

      {/* Complete panel */}
      {panel === 'complete' && (
        <div className="wo-complete-form" style={{ marginTop: 16, padding: 16, border: '1px solid #e4e7ec', borderRadius: 10, background: '#f9fafb' }}>
          <h3 style={{ marginTop: 0 }}>Complete Work Order</h3>
          <p style={{ marginTop: -6, fontSize: 13, color: '#667085' }}>
            {completingCrew
              ? `This is the last crew out (${completingCrew.soloTask ? 'One-man task' : `Crew ${completingCrew.crewNumber}`}). Record the work order's completion report.`
              : 'Record the completion report.'}
          </p>
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
            <button className="wo-btn" onClick={() => { setPanel(''); setCompletingCrew(null); }}>Cancel</button>
            <button className="wo-btn wo-btn--success" onClick={doCompleteCrew} disabled={acting}>
              {acting ? 'Saving…' : 'Mark Completed'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel panel */}
      {panel === 'cancel' && (
        <div className="wo-cancel-form" style={{ marginTop: 16, padding: 16, border: '1px solid #fecdca', borderRadius: 10, background: '#fef3f2' }}>
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

      <div className="wo-meta" style={{ marginTop: 16, fontSize: 12, color: '#667085' }}>
        Created by {wo.creator?.username ?? '—'} on {fmtDateTime(wo.createdAt)}
      </div>
    </div>
  );
}
