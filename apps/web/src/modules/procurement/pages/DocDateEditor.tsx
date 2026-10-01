import { useState } from 'react';

interface Props {
  // The current date as an ISO string (e.g. the record's createdAt / poDate).
  value: string;
  // Whether the current user may change it (permission-gated by the caller).
  canEdit: boolean;
  // Persist the new date (yyyy-mm-dd); should throw on failure (shown inline).
  onSave: (nextIso: string) => Promise<void>;
}

function toInputDate(iso: string): string {
  // Render the stored timestamp in the local date, matching the display below.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Inline editor for a document date (PR date / PO date). Shows the formatted
// date with a pencil; clicking swaps in a native date picker with Save/Cancel.
export function DocDateEditor({ value, canEdit, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toInputDate(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function start() {
    setDraft(toInputDate(value));
    setError('');
    setEditing(true);
  }

  async function save() {
    if (!draft) {
      setError('A date is required.');
      return;
    }
    if (draft === toInputDate(value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {new Date(value).toLocaleDateString()}
        {canEdit && (
          <button type="button" onClick={start} title="Edit date" aria-label="Edit date" style={editBtn}>
            ✎
          </button>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoFocus
          style={input}
        />
        <button type="button" className="pr-btn pr-btn--primary" onClick={save} disabled={saving} style={smallBtn}>
          {saving ? '…' : 'Save'}
        </button>
        <button type="button" className="pr-btn" onClick={() => setEditing(false)} disabled={saving} style={smallBtn}>
          Cancel
        </button>
      </span>
      {error && <span style={{ color: 'var(--mswd-red, #b42318)', fontSize: 12 }}>{error}</span>}
    </span>
  );
}

const editBtn: React.CSSProperties = {
  border: '1px solid #d0d5dd',
  background: '#fff',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#667085',
  fontSize: 12,
  lineHeight: 1,
  padding: '1px 5px',
};
const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12 };
const input: React.CSSProperties = {
  padding: '4px 8px',
  border: '1.5px solid #d0d5dd',
  borderRadius: 4,
  fontSize: 13,
};
