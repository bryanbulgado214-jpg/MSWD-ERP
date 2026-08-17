import { useEffect, useRef, useState } from 'react';

import { createPayee, getPayees, type Payee } from '../api';

import './accounting.css';

export interface PickedPayee {
  name: string;
  tin: string | null;
  address: string | null;
}

/**
 * Type-to-search payee picker. Suggestions come from the payee master; picking
 * one hands the full record (name, TIN, address) back to the caller so it can
 * auto-populate. If the payee isn't on the list yet, an inline "Add" flow opens
 * a small window to create it — it's saved to the master and selected.
 */
export function PayeeCombobox({
  name,
  onNameChange,
  onPick,
  inputStyle,
  placeholder,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onPick: (p: PickedPayee) => void;
  inputStyle?: React.CSSProperties;
  placeholder?: string;
}) {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', tin: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPayees()
      .then(setPayees)
      .catch(() => {
        /* master optional */
      });
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const trimmed = name.trim();
  const q = trimmed.toLowerCase();
  const filtered = (
    q ? payees.filter((p) => p.name.toLowerCase().includes(q) || (p.tin ?? '').includes(q)) : payees
  ).slice(0, 40);
  // Only offer "Add" when something is typed and it's not already an exact
  // payee name — so the user can't create a duplicate of an existing payee.
  const hasExactMatch = payees.some((p) => p.name.trim().toLowerCase() === q);
  const showAdd = trimmed.length > 0 && !hasExactMatch;

  const defaultInput: React.CSSProperties = {
    width: '100%',
    padding: '7px 9px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    fontSize: 13,
    boxSizing: 'border-box',
  };
  const modalField: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
  const modalLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#344054' };

  function openAdd() {
    setForm({ name: name.trim(), tin: '', address: '' });
    setErr('');
    setAdding(true);
    setOpen(false);
  }

  async function saveNew() {
    if (!form.name.trim()) return;
    setSaving(true);
    setErr('');
    try {
      const created = await createPayee({
        name: form.name.trim(),
        ...(form.tin.trim() ? { tin: form.tin.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
      });
      setPayees((prev) => [created, ...prev]);
      onPick({ name: created.name, tin: created.tin, address: created.address });
      setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add payee.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={inputStyle ?? defaultInput}
        value={name}
        placeholder={placeholder ?? 'Type or select a payee…'}
        onChange={(e) => {
          onNameChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 30,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: 260,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #d0d5dd',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(16,24,40,0.12)',
          }}
        >
          {filtered.map((p) => (
            <div
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick({ name: p.name, tin: p.tin, address: p.address });
                setOpen(false);
              }}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f2f4f7' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#667085' }}>
                {p.tin ? `TIN ${p.tin}` : 'No TIN'}
                {p.address ? ` · ${p.address}` : ''}
              </div>
            </div>
          ))}
          {filtered.length === 0 && !showAdd && (
            <div style={{ padding: '8px 10px', color: '#98a2b3', fontSize: 12 }}>
              No matching payee.
            </div>
          )}
          {showAdd && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                openAdd();
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                borderTop: '1px solid #eaecf0',
                background: '#f9fafb',
                color: 'var(--mswd-blue, #175cd3)',
                fontWeight: 600,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              + Add “{trimmed}” to the payee list
            </button>
          )}
        </div>
      )}

      {adding && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              width: 'min(460px, 100%)',
              boxShadow: '0 20px 48px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#101828' }}>Add new payee</h3>
            {err && <div style={{ color: '#b42318', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={modalField}>
                <span style={modalLabel}>Payee name *</span>
                <input
                  autoFocus
                  style={defaultInput}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div style={modalField}>
                <span style={modalLabel}>TIN</span>
                <input
                  style={defaultInput}
                  value={form.tin}
                  onChange={(e) => setForm({ ...form, tin: e.target.value })}
                  placeholder="000-000-000-00000"
                />
              </div>
              <div style={modalField}>
                <span style={modalLabel}>Address</span>
                <input
                  style={defaultInput}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="acct-btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                disabled={!form.name.trim() || saving}
                onClick={saveNew}
              >
                {saving ? 'Saving…' : 'Save payee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
