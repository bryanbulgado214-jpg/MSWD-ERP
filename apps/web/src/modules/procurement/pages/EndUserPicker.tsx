import { useState } from 'react';

import { createEndUser, updateEndUser, type EndUser, type LookupDepartment } from '../api';

interface Props {
  endUsers: EndUser[];
  value: string;
  departments: LookupDepartment[];
  onChange: (id: string) => void;
  /** Parent appends the created end-user to its list and selects it. */
  onCreated: (created: EndUser) => void;
  /** Parent replaces the edited end-user in its list (keeps the same id). */
  onUpdated?: (updated: EndUser) => void;
  defaultDepartmentId?: string;
  disabled?: boolean;
}

// Pick a requesting end-user from the managed list, add a new one, or correct an
// existing one's section. The budget officer keeps this list; the end-users are
// people/positions, not login accounts.
export function EndUserPicker({
  endUsers,
  value,
  departments,
  onChange,
  onCreated,
  onUpdated,
  defaultDepartmentId,
  disabled,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [deptId, setDeptId] = useState(defaultDepartmentId ?? '');
  const [position, setPosition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit (correct an existing end-user's section / details).
  const selected = endUsers.find((u) => u.id === value) ?? null;
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editPosition, setEditPosition] = useState('');

  function openAdd() {
    setName('');
    setPosition('');
    setDeptId(defaultDepartmentId ?? departments[0]?.id ?? '');
    setError('');
    setAdding(true);
  }

  async function save() {
    if (!name.trim() || !deptId) {
      setError('Name and section are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createEndUser({
        name: name.trim(),
        departmentId: deptId,
        ...(position.trim() ? { position: position.trim() } : {}),
      });
      onCreated(created);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add the end-user.');
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    if (!selected) return;
    setEditName(selected.name);
    setEditDeptId(selected.departmentId);
    setEditPosition(selected.position ?? '');
    setError('');
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    if (!editName.trim() || !editDeptId) {
      setError('Name and section are required.');
      return;
    }
    const oldDeptName =
      selected.department?.name ??
      departments.find((d) => d.id === selected.departmentId)?.name ??
      '—';
    const newDeptName = departments.find((d) => d.id === editDeptId)?.name ?? '—';
    const sectionChanged = editDeptId !== selected.departmentId;

    const confirmMsg = sectionChanged
      ? `Change section of ${selected.name} from ${oldDeptName} to ${newDeptName}?`
      : `Save changes to ${selected.name}?`;
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    setError('');
    try {
      const updated = await updateEndUser(selected.id, {
        expectedVersion: selected.version,
        name: editName.trim(),
        departmentId: editDeptId,
        position: editPosition.trim(),
      });
      onUpdated?.(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update the end-user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        <option value="">— Select end-user —</option>
        {departments.map((d) => {
          const list = endUsers.filter((u) => u.departmentId === d.id);
          if (!list.length) return null;
          return (
            <optgroup key={d.id} label={d.name}>
              {list.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.position ? ` — ${u.position}` : ''}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      {onUpdated && (
        <button
          type="button"
          className="pr-btn"
          onClick={openEdit}
          disabled={disabled || !selected}
          title={selected ? `Edit ${selected.name}` : 'Select an end-user to edit'}
        >
          Edit
        </button>
      )}
      <button type="button" className="pr-btn" onClick={openAdd} disabled={disabled}>
        + New
      </button>

      {adding && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setAdding(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              width: 'min(480px, 92vw)',
              boxShadow: '0 20px 48px rgba(16,24,40,0.24)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', color: 'var(--mswd-navy)' }}>Add End-User</h3>
            {error && <div className="pr-error">{error}</div>}
            <div className="pr-field" style={{ marginBottom: 12 }}>
              <label>Name</label>
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Juan dela Cruz / Cashier"
              />
            </div>
            <div className="pr-field" style={{ marginBottom: 12 }}>
              <label>Section</label>
              <select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">— Select section —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pr-field" style={{ marginBottom: 20 }}>
              <label>Position (optional)</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. Senior Cashier"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="pr-btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="pr-btn pr-btn--primary"
                onClick={save}
                disabled={saving || !name.trim() || !deptId}
              >
                {saving ? 'Saving…' : 'Add End-User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setEditing(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              width: 'min(480px, 92vw)',
              boxShadow: '0 20px 48px rgba(16,24,40,0.24)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 4px', color: 'var(--mswd-navy)' }}>Edit End-User</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#667085' }}>
              Correct the section or details. Everything already linked to this end-user stays
              connected.
            </p>
            {error && <div className="pr-error">{error}</div>}
            <div className="pr-field" style={{ marginBottom: 12 }}>
              <label>Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="pr-field" style={{ marginBottom: 12 }}>
              <label>Section</label>
              <select value={editDeptId} onChange={(e) => setEditDeptId(e.target.value)}>
                <option value="">— Select section —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pr-field" style={{ marginBottom: 20 }}>
              <label>Position (optional)</label>
              <input
                type="text"
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="pr-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="pr-btn pr-btn--primary"
                onClick={saveEdit}
                disabled={saving || !editName.trim() || !editDeptId}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
