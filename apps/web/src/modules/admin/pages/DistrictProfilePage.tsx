import { useEffect, useState } from 'react';

import {
  getOrganizationProfile,
  updateOrganizationProfile,
  type OrganizationProfile,
} from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#475467',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  margin: '0 0 5px',
};

export function DistrictProfilePage() {
  const [form, setForm] = useState<OrganizationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getOrganizationProfile()
      .then((p) => setForm(p))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof OrganizationProfile>(key: K, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      await updateOrganizationProfile({
        name: form.name,
        legalName: form.legalName,
        address: form.address ?? '',
        contact: form.contact ?? '',
        logoUrl: form.logoUrl ?? '',
        manualDocumentNumbering: form.manualDocumentNumbering,
      });
      setSaved(true);
      // Reload so the header and printed forms pick up the new profile everywhere.
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <AdminSubNav />
      <h1>District Profile</h1>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 20px', maxWidth: 640 }}>
        These details identify your water district across the system — the app header, report
        headings, and the letterhead on printed forms (e.g. the Journal Entry Voucher). Changes
        apply everywhere once saved.
      </p>

      {loading && <div className="admin-empty">Loading…</div>}
      {error && <div className="admin-error">{error}</div>}

      {form && (
        <form
          onSubmit={handleSave}
          style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div>
            <label style={LABEL_STYLE}>Display Name</label>
            <input
              style={FIELD_STYLE}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
            <div style={{ fontSize: 12, color: '#98a2b3', marginTop: 4 }}>
              Shown in the top bar and on forms (e.g. "Sta. Barbara Water District").
            </div>
          </div>
          <div>
            <label style={LABEL_STYLE}>Legal / Registered Name</label>
            <input
              style={FIELD_STYLE}
              value={form.legalName}
              onChange={(e) => set('legalName', e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Address</label>
            <textarea
              style={{ ...FIELD_STYLE, minHeight: 60, resize: 'vertical' }}
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              placeholder="e.g. Rizal Street, Poblacion, Sta. Barbara, Iloilo 5002"
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Contact Line</label>
            <input
              style={FIELD_STYLE}
              value={form.contact ?? ''}
              onChange={(e) => set('contact', e.target.value)}
              placeholder="e.g. Tel. (033) 523-0000 • sbwd@example.invalid"
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Logo URL</label>
            <input
              style={FIELD_STYLE}
              value={form.logoUrl ?? ''}
              onChange={(e) => set('logoUrl', e.target.value)}
              placeholder="Optional — e.g. /aquabooks-mark.png or https://…"
            />
            <div style={{ fontSize: 12, color: '#98a2b3', marginTop: 4 }}>
              Optional. Leave blank to use the default emblem. A path served by the app (like{' '}
              <code>/aquabooks-mark.png</code>) or a full URL both work.
            </div>
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt="Logo preview"
                style={{ height: 56, marginTop: 8, objectFit: 'contain' }}
                onError={(ev) => {
                  (ev.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
          </div>

          <div
            style={{
              borderTop: '1px solid #eaecf0',
              paddingTop: 16,
            }}
          >
            <label style={LABEL_STYLE}>Document Numbering</label>
            <label
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={form.manualDocumentNumbering}
                onChange={(e) => {
                  setForm((f) => (f ? { ...f, manualDocumentNumbering: e.target.checked } : f));
                  setSaved(false);
                }}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13 }}>
                <strong>Enter JEV &amp; DV numbers manually</strong>
                <br />
                <span style={{ color: '#667085' }}>
                  Turns off automatic numbering so you can type the exact document number when
                  back-entering historical Journal Entry Vouchers and Disbursement Vouchers. Turn
                  this off later to resume auto-numbering for new entries.
                </span>
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 22px',
                background: 'var(--mswd-navy, #0a2a66)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
            {saved && (
              <span style={{ color: '#067647', fontSize: 13, fontWeight: 600 }}>
                Saved — refreshing…
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
