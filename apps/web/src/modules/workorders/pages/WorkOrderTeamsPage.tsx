import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  createPersonnel,
  createTeam,
  listPersonnel,
  listTeams,
  updatePersonnel,
  updateTeam,
} from '../api';
import {
  WO_NATURE_LABELS,
  type WorkOrderPersonnel,
  type WorkOrderTeam,
} from '../types';
import '../workorders.css';

export default function WorkOrderTeamsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('workorder.team.manage');
  const [personnel, setPersonnel] = useState<WorkOrderPersonnel[]>([]);
  const [teams, setTeams] = useState<WorkOrderTeam[]>([]);
  const [error, setError] = useState('');

  // add-personnel form
  const [pName, setPName] = useState('');
  const [pDesignation, setPDesignation] = useState('');
  const [pSection, setPSection] = useState('');

  // team form
  const [showTeam, setShowTeam] = useState(false);
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [tName, setTName] = useState('');
  const [tSection, setTSection] = useState('');
  const [tLeaderId, setTLeaderId] = useState('');
  const [tMemberIds, setTMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function fetchAll() {
    Promise.all([listPersonnel(), listTeams()])
      .then(([p, t]) => {
        setPersonnel(p);
        setTeams(t);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }

  async function addPersonnel(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) return;
    setError('');
    try {
      await createPersonnel({
        name: pName.trim(),
        ...(pDesignation.trim() ? { designation: pDesignation.trim() } : {}),
        ...(pSection ? { section: pSection } : {}),
      });
      setPName('');
      setPDesignation('');
      setPSection('');
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add personnel');
    }
  }

  async function togglePersonnelActive(p: WorkOrderPersonnel) {
    try {
      await updatePersonnel(p.id, { isActive: !p.isActive });
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function openNewTeam() {
    setEditTeamId(null);
    setTName('');
    setTSection('');
    setTLeaderId('');
    setTMemberIds([]);
    setShowTeam(true);
  }
  function openEditTeam(t: WorkOrderTeam) {
    setEditTeamId(t.id);
    setTName(t.name);
    setTSection(t.section ?? '');
    setTLeaderId(t.leaderId ?? '');
    setTMemberIds((t.members ?? []).map((m) => m.personnel.id));
    setShowTeam(true);
  }
  function toggleTMember(pid: string) {
    setTMemberIds((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]));
  }

  async function saveTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!tName.trim()) return;
    setSaving(true);
    setError('');
    const memberIds = [...new Set([...(tLeaderId ? [tLeaderId] : []), ...tMemberIds])];
    try {
      if (editTeamId) {
        await updateTeam(editTeamId, {
          name: tName.trim(),
          ...(tSection ? { section: tSection } : {}),
          ...(tLeaderId ? { leaderId: tLeaderId } : {}),
          memberIds,
        });
      } else {
        await createTeam({
          name: tName.trim(),
          ...(tSection ? { section: tSection } : {}),
          ...(tLeaderId ? { leaderId: tLeaderId } : {}),
          memberIds,
        });
      }
      setShowTeam(false);
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save team');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wo-page">
      <Link to="/work-orders" className="wo-back">
        <span className="wo-back__arrow" aria-hidden="true">&larr;</span>
        Back to Work Orders
      </Link>
      <div className="wo-page__header">
        <h1>Teams &amp; Personnel</h1>
      </div>
      {error && <div className="wo-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Personnel */}
        <div className="wo-card">
          <div className="wo-card__title">Field Personnel</div>
          {canManage && (
            <form onSubmit={addPersonnel} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <input className="wo-input" style={{ flex: 2, minWidth: 140 }} placeholder="Name" value={pName} onChange={(e) => setPName(e.target.value)} />
              <input className="wo-input" style={{ flex: 1, minWidth: 110 }} placeholder="Designation" value={pDesignation} onChange={(e) => setPDesignation(e.target.value)} />
              <select className="wo-select" style={{ flex: 1, minWidth: 110 }} value={pSection} onChange={(e) => setPSection(e.target.value)}>
                <option value="">Section…</option>
                <option value="technical">Technical</option>
                <option value="commercial">Commercial</option>
              </select>
              <button className="wo-btn wo-btn--primary wo-btn--sm" type="submit">Add</button>
            </form>
          )}
          <table className="wo-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#667085' }}>
                <th style={{ padding: '4px 6px' }}>Name</th>
                <th style={{ padding: '4px 6px' }}>Designation</th>
                <th style={{ padding: '4px 6px' }}>Section</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {personnel.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid #eef0f3', opacity: p.isActive ? 1 : 0.5 }}>
                  <td style={{ padding: '4px 6px' }}>{p.name}</td>
                  <td style={{ padding: '4px 6px' }}>{p.designation ?? '—'}</td>
                  <td style={{ padding: '4px 6px' }}>{p.section ? WO_NATURE_LABELS[p.section] : '—'}</td>
                  {canManage && (
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <button className="wo-btn wo-btn--sm" onClick={() => togglePersonnelActive(p)}>
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {personnel.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 10, color: '#667085' }}>No personnel yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Teams */}
        <div className="wo-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="wo-card__title" style={{ margin: 0 }}>Teams</div>
            {canManage && <button className="wo-btn wo-btn--primary wo-btn--sm" onClick={openNewTeam}>+ New Team</button>}
          </div>

          {showTeam && (
            <form onSubmit={saveTeam} className="wo-crew-box" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <input className="wo-input" style={{ flex: 2, minWidth: 140 }} placeholder="Team name" value={tName} onChange={(e) => setTName(e.target.value)} />
                <select className="wo-select" style={{ flex: 1, minWidth: 110 }} value={tSection} onChange={(e) => setTSection(e.target.value)}>
                  <option value="">Section…</option>
                  <option value="technical">Technical</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <label className="wo-form__field" style={{ marginBottom: 8 }}>
                <span className="wo-form__label">Leader</span>
                <select className="wo-select" value={tLeaderId} onChange={(e) => setTLeaderId(e.target.value)}>
                  <option value="">— Select leader —</option>
                  {personnel.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.designation ? ` — ${p.designation}` : ''}</option>
                  ))}
                </select>
              </label>
              <span className="wo-form__label">Members</span>
              <div className="wo-member-grid">
                {personnel.filter((p) => p.isActive).map((p) => (
                  <label key={p.id} className="wo-member-chip">
                    <input type="checkbox" checked={tMemberIds.includes(p.id) || p.id === tLeaderId} disabled={p.id === tLeaderId} onChange={() => toggleTMember(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
              <div className="wo-form__actions">
                <button type="button" className="wo-btn" onClick={() => setShowTeam(false)}>Cancel</button>
                <button type="submit" className="wo-btn wo-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save Team'}</button>
              </div>
            </form>
          )}

          <table className="wo-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#667085' }}>
                <th style={{ padding: '4px 6px' }}>Team</th>
                <th style={{ padding: '4px 6px' }}>Leader</th>
                <th style={{ padding: '4px 6px' }}>Members</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid #eef0f3' }}>
                  <td style={{ padding: '4px 6px' }}>{t.name}</td>
                  <td style={{ padding: '4px 6px' }}>{t.leader?.name ?? '—'}</td>
                  <td style={{ padding: '4px 6px' }}>{(t.members ?? []).length}</td>
                  {canManage && (
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <button className="wo-btn wo-btn--sm" onClick={() => openEditTeam(t)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
              {teams.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 10, color: '#667085' }}>No teams yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
