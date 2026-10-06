import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { createWorkOrder, listPersonnel, listTeams } from '../api';
import {
  natureOfType,
  signatureRequiredByDefault,
  WO_NATURE_LABELS,
  WO_TYPE_LABELS,
  type WorkOrderPersonnel,
  type WorkOrderTeam,
  type WorkOrderType,
} from '../types';
import '../workorders.css';

const ALL_TYPES = Object.keys(WO_TYPE_LABELS) as WorkOrderType[];
const TECH_TYPES = ALL_TYPES.filter((t) => natureOfType(t) === 'technical');
const COMM_TYPES = ALL_TYPES.filter((t) => natureOfType(t) === 'commercial');

export default function WorkOrderNewPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [type, setType] = useState<WorkOrderType>('installation');
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sigRequired, setSigRequired] = useState(signatureRequiredByDefault('installation'));
  const [sigTouched, setSigTouched] = useState(false);

  const nature = natureOfType(type);
  const canAssign = hasPermission(
    nature === 'technical' ? 'workorder.assign.technical' : 'workorder.assign.commercial',
  );

  const [personnel, setPersonnel] = useState<WorkOrderPersonnel[]>([]);
  const [teams, setTeams] = useState<WorkOrderTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    listPersonnel().then(setPersonnel).catch(() => {});
    listTeams().then(setTeams).catch(() => {});
  }, []);

  // Default the signature toggle from the task type until the user overrides it.
  useEffect(() => {
    if (!sigTouched) setSigRequired(signatureRequiredByDefault(type));
  }, [type, sigTouched]);

  function applyTeam(id: string) {
    setTeamId(id);
    const team = teams.find((t) => t.id === id);
    if (team) {
      setLeaderId(team.leaderId ?? '');
      setMemberIds((team.members ?? []).map((m) => m.personnel.id));
    }
  }

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const crewValid = useMemo(() => !!leaderId && (memberIds.length > 0 || !!leaderId), [leaderId, memberIds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const assigningNow = canAssign && !!leaderId;
      const wo = await createWorkOrder({
        type,
        priority,
        title,
        customerSignatureRequired: sigRequired,
        ...(description ? { description } : {}),
        ...(customerName ? { customerName } : {}),
        ...(location ? { location } : {}),
        ...(scheduledDate ? { scheduledDate } : {}),
        ...(instructions ? { instructions } : {}),
        ...(assigningNow
          ? {
              ...(teamId ? { teamId } : {}),
              teamLeaderId: leaderId,
              memberIds: [...new Set([leaderId, ...memberIds])],
            }
          : {}),
      });
      navigate(`/work-orders/${wo.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create work order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>New Work Order</h1>
      </div>

      {error && <div className="wo-error">{error}</div>}

      <form onSubmit={handleSubmit} className="wo-form">
        <div className="wo-form__grid">
          <label className="wo-form__field">
            <span className="wo-form__label">Task Type *</span>
            <select
              className="wo-select"
              value={type}
              onChange={(e) => setType(e.target.value as WorkOrderType)}
              required
            >
              <optgroup label="Technical">
                {TECH_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WO_TYPE_LABELS[t]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Commercial">
                {COMM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WO_TYPE_LABELS[t]}
                  </option>
                ))}
              </optgroup>
            </select>
            <span style={{ fontSize: 12, color: nature === 'technical' ? '#b54708' : '#067647', marginTop: 4 }}>
              {WO_NATURE_LABELS[nature]} task
              {nature === 'technical'
                ? ' — Technical Services assigns the crew.'
                : ' — Commercial Services can run it directly.'}
            </span>
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Priority</span>
            <select className="wo-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Title *</span>
            <input
              className="wo-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Brief description of the work"
            />
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Customer / Account</span>
            <input
              className="wo-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name of the concerned customer (if any)"
            />
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Location</span>
            <input
              className="wo-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or area"
            />
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Scheduled Date</span>
            <input
              type="date"
              className="wo-input"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </label>

          <label className="wo-form__field" style={{ justifyContent: 'flex-end' }}>
            <span className="wo-form__label">Customer signature</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingTop: 6 }}>
              <input
                type="checkbox"
                checked={sigRequired}
                onChange={(e) => {
                  setSigTouched(true);
                  setSigRequired(e.target.checked);
                }}
              />
              Require the customer&apos;s signature on the printed work order
            </label>
          </label>

          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Description</span>
            <textarea
              className="wo-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </label>

          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Instructions to crew</span>
            <textarea
              className="wo-textarea"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              placeholder="What the office wants the crew to do"
            />
          </label>
        </div>

        {/* Crew assignment — only when this user may assign for this nature. */}
        {canAssign ? (
          <div className="wo-crew-box">
            <h3 className="wo-crew-box__title">Assign Crew (optional)</h3>
            <div className="wo-form__grid">
              <label className="wo-form__field">
                <span className="wo-form__label">Use a team</span>
                <select className="wo-select" value={teamId} onChange={(e) => applyTeam(e.target.value)}>
                  <option value="">— Pick a team (prefills below) —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wo-form__field">
                <span className="wo-form__label">Team Leader</span>
                <select className="wo-select" value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
                  <option value="">— Select leader —</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.designation ? ` — ${p.designation}` : ''}
                    </option>
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
                {personnel.length === 0 && (
                  <span style={{ fontSize: 12, color: '#667085' }}>
                    No personnel yet — add them under Teams &amp; Personnel.
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                Leave the crew blank to create the order unassigned.
              </span>
            </div>
          </div>
        ) : (
          <div className="wo-note">
            This is a <strong>{WO_NATURE_LABELS[nature]}</strong> task. It will be created awaiting
            crew assignment by {nature === 'technical' ? 'Technical' : 'Commercial'} Services.
          </div>
        )}

        <div className="wo-form__actions">
          <button type="button" className="wo-btn" onClick={() => navigate('/work-orders')}>
            Cancel
          </button>
          <button
            type="submit"
            className="wo-btn wo-btn--primary"
            disabled={saving || !title || (canAssign && !!leaderId && !crewValid)}
          >
            {saving ? 'Creating...' : 'Create Work Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
