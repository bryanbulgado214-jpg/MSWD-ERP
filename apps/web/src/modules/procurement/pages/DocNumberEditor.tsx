import { useState } from 'react';

interface Props {
  // The current document number (e.g. PR-000001 / PO-000001).
  value: string;
  // Whether the current user may change it (permission-gated by the caller).
  canEdit: boolean;
  // Persist the new number; should throw on failure (message shown inline).
  onSave: (next: string) => Promise<void>;
  // What kind of number, e.g. "PR" or "PO" — used for the placeholder/labels.
  label: string;
}

// Inline editor for a document number, shown as the page's <h1>. Clicking the
// pencil swaps the heading for a small input with Save/Cancel. Used on the PR
// and PO detail pages so the number can be corrected at any status.
export function DocNumberEditor({ value, canEdit, onSave, label }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function start() {
    setDraft(value);
    setError('');
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError('');
  }

  async function save() {
    const next = draft.trim();
    if (!next) {
      setError(`${label} number cannot be blank.`);
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <h1 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {value}
        {canEdit && (
          <button
            type="button"
            onClick={start}
            title={`Edit ${label} number`}
            aria-label={`Edit ${label} number`}
            style={editBtn}
          >
            ✎
          </button>
        )}
      </h1>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={30}
          autoFocus
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          placeholder={`${label}-000001`}
          style={input}
        />
        <button type="button" className="pr-btn pr-btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="pr-btn" onClick={cancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {error && (
        <span style={{ color: 'var(--mswd-red, #b42318)', fontSize: 12 }}>{error}</span>
      )}
    </div>
  );
}

const editBtn: React.CSSProperties = {
  border: '1px solid #d0d5dd',
  background: '#fff',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#667085',
  fontSize: 14,
  lineHeight: 1,
  padding: '2px 6px',
};

const input: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--mswd-navy)',
  padding: '4px 10px',
  border: '1.5px solid #d0d5dd',
  borderRadius: 6,
  minWidth: 200,
};
