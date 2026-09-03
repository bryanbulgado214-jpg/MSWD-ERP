import { useEffect, useState } from 'react';

import { SIGNATORY_DOCS, type SignatoryMap } from '../../../app/signatories';
import { getOrganizationProfile, updateOrganizationProfile } from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const SMALL_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#667085',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  margin: '0 0 4px',
};

export function SignatoriesPage() {
  const [sig, setSig] = useState<SignatoryMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getOrganizationProfile()
      .then((p) => setSig(p.signatories ?? {}))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load signatories.'))
      .finally(() => setLoading(false));
  }, []);

  function setField(doc: string, slot: string, field: 'name' | 'title', value: string) {
    setSig((prev) => {
      const next: SignatoryMap = { ...(prev ?? {}) };
      const docMap = { ...(next[doc] ?? {}) };
      const cur = docMap[slot] ?? { name: '', title: '' };
      docMap[slot] = { ...cur, [field]: value };
      next[doc] = docMap;
      return next;
    });
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!sig) return;
    setSaving(true);
    setError('');
    try {
      await updateOrganizationProfile({ signatories: sig });
      setSaved(true);
      // Reload so every open print view picks up the new names via /auth/me.
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
      <h1>Signatories</h1>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 20px', maxWidth: 680 }}>
        Set the name and designation for each signature block. These print automatically on the
        matching documents. Leave a name blank to keep a blank signing line; leave a designation
        blank to use the document’s standard title (shown as the placeholder).
      </p>

      {loading && <div className="admin-empty">Loading…</div>}
      {error && <div className="admin-error">{error}</div>}

      {sig && (
        <form
          onSubmit={handleSave}
          style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 22 }}
        >
          {SIGNATORY_DOCS.map((doc) => (
            <section
              key={doc.key}
              style={{ border: '1px solid #eaecf0', borderRadius: 8, padding: '14px 16px' }}
            >
              <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>{doc.label}</h2>
              {doc.note && (
                <div style={{ fontSize: 12, color: '#98a2b3', margin: '0 0 12px' }}>{doc.note}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                {doc.slots.map((slot) => {
                  const val = sig[doc.key]?.[slot.key] ?? { name: '', title: '' };
                  return (
                    <div key={slot.key}>
                      <div
                        style={{ fontSize: 13, fontWeight: 600, color: '#344054', marginBottom: 6 }}
                      >
                        {slot.label}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 10,
                        }}
                      >
                        <div>
                          <label style={SMALL_LABEL}>Name</label>
                          <input
                            style={FIELD_STYLE}
                            value={val.name}
                            onChange={(e) => setField(doc.key, slot.key, 'name', e.target.value)}
                            placeholder="e.g. Maria L. Santos"
                          />
                        </div>
                        <div>
                          <label style={SMALL_LABEL}>Designation</label>
                          <input
                            style={FIELD_STYLE}
                            value={val.title}
                            onChange={(e) => setField(doc.key, slot.key, 'title', e.target.value)}
                            placeholder={slot.defaultTitle || 'e.g. General Manager'}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

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
              {saving ? 'Saving…' : 'Save Signatories'}
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
