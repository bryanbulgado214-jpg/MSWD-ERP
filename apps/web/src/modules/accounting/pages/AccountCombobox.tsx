import { useEffect, useMemo, useRef, useState } from 'react';

interface AccountOption {
  id: string;
  accountCode: string;
  name: string;
}

/**
 * A type-to-filter account picker: a search input with a live-filtered dropdown
 * of chart-of-account entries. Replaces a plain <select> so the accountant can
 * find a UACS account by typing part of its code or name.
 */
export function AccountCombobox({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: AccountOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = accounts.find((a) => a.id === value);
  const label = selected ? `${selected.accountCode} — ${selected.name}` : '';

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? accounts.filter(
          (a) => a.accountCode.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
        )
      : accounts;
    return list.slice(0, 60);
  }, [accounts, query]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 9px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    fontSize: 12,
    boxSizing: 'border-box',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={inputStyle}
        value={open ? query : label}
        placeholder={placeholder ?? 'Search account by code or name...'}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #d0d5dd',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(16,24,40,0.12)',
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '8px 10px', color: '#98a2b3', fontSize: 12 }}>
              No matching accounts
            </div>
          )}
          {filtered.map((a) => (
            <div
              key={a.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(a.id);
                setOpen(false);
                setQuery('');
              }}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                background: a.id === value ? '#eef4ff' : 'transparent',
                borderBottom: '1px solid #f2f4f7',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#475467' }}>
                {a.accountCode}
              </span>{' '}
              <span style={{ fontSize: 12 }}>{a.name}</span>
            </div>
          ))}
          {filtered.length >= 60 && (
            <div style={{ padding: '5px 10px', color: '#98a2b3', fontSize: 11 }}>
              Keep typing to narrow results…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
