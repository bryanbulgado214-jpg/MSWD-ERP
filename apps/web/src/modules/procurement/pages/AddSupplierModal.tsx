import { useEffect, useState } from 'react';

import { createSupplierPayee, ProcurementApiError, type SupplierPayee } from '../api';

interface Props {
  // Prefill the name from whatever the officer may have typed/searched.
  initialName?: string;
  onCreated: (supplier: SupplierPayee) => void;
  onClose: () => void;
}

// A floating window to register a new supplier without leaving the New Purchase
// Order page. It writes to the SHARED supplier master (the accountant's payee
// list), so the new supplier also shows in accounting. On success the created
// supplier is handed back so it can be dropped into the dropdown and selected.
export function AddSupplierModal({ initialName = '', onCreated, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [tin, setTin] = useState('');
  const [address, setAddress] = useState('');
  const [vatRegistered, setVatRegistered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const supplier = await createSupplierPayee({
        name: name.trim(),
        ...(tin.trim() ? { tin: tin.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        vatRegistered,
      });
      onCreated(supplier);
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to add the supplier.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={card} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)' }}>
              Add New Supplier
            </div>
            <div style={{ fontSize: 12, color: '#667085' }}>
              Added to the shared supplier list (also visible in accounting).
            </div>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close" type="button">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '0 20px 18px' }}>
          {error && <div className="pr-error">{error}</div>}
          <div className="pr-form" style={{ gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pr-field">
                <label>Supplier Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={255} />
              </div>
              <div className="pr-field">
                <label>TIN</label>
                <input value={tin} onChange={(e) => setTin(e.target.value)} maxLength={30} />
              </div>
            </div>
            <div className="pr-field">
              <label>Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
              />
              VAT-registered
            </label>
            <div className="pr-form-actions">
              <button type="button" className="pr-btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="pr-btn pr-btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16,24,40,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};
const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  width: 'min(680px, 94vw)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  boxShadow: '0 24px 56px rgba(16,24,40,0.28)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '18px 20px 12px',
};
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 22,
  cursor: 'pointer',
  color: '#667085',
  lineHeight: 1,
};
