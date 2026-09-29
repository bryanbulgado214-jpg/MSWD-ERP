import { useState } from 'react';

import { createEndUser, type EndUser, type LookupDepartment } from '../api';

interface Props {
  endUsers: EndUser[];
  value: string;
  departments: LookupDepartment[];
  onChange: (id: string) => void;
  /** Parent appends the created end-user to its list and selects it. */
  onCreated: (created: EndUser) => void;
  defaultDepartmentId?: string;
  disabled?: boolean;
}

// Pick a requesting end-user from the managed list, or add a new one on the spot
// (like the accountant adding a payee). The budget officer keeps this list; the
// end-users are people/positions, not login accounts.
export function EndUserPicker({
  endUsers,
  value,
  departments,
  onChange,
  onCreated,
  defaultDepartmentId,
  disabled,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [deptId, setDeptId] = useState(defaultDepartmentId ?? '');
  const [position, setPosition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    </div>
  );
}
