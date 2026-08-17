import { useEffect, useState } from 'react';

import {
  AccountingApiError,
  createPayee,
  getPayees,
  mergePayee,
  updatePayee,
  type Payee,
} from '../../accounting/api';
import '../../accounting/pages/accounting.css';

type EditState = null | { mode: 'new' } | { mode: 'edit'; payee: Payee };

const input: React.CSSProperties = {
  padding: '7px 9px',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
  width: '100%',
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#344054' };

/**
 * Payee master — the district's list of suppliers/payees (name, address, TIN).
 * Payees can be added, edited, merged (to fix duplicates) and deactivated, but
 * never deleted.
 */
export function PayeesPage() {
  const [payees, setPayees] = useState<Payee[] | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [edit, setEdit] = useState<EditState>(null);
  const [form, setForm] = useState({ name: '', address: '', tin: '' });
  const [mergeSource, setMergeSource] = useState<Payee | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (showInactive) params.set('includeInactive', 'true');
    return getPayees(params.toString())
      .then(setPayees)
      .catch((e) => setError(e instanceof AccountingApiError ? e.message : 'Failed to load.'));
  };

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce search
    return () => clearTimeout(t);
  }, [search, showInactive]);

  function openNew() {
    setForm({ name: '', address: '', tin: '' });
    setEdit({ mode: 'new' });
    setMergeSource(null);
  }
  function openEdit(p: Payee) {
    setForm({ name: p.name, address: p.address ?? '', tin: p.tin ?? '' });
    setEdit({ mode: 'edit', payee: p });
    setMergeSource(null);
  }

  async function save() {
    if (!edit || !form.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (edit.mode === 'new') {
        await createPayee({
          name: form.name.trim(),
          ...(form.address.trim() ? { address: form.address.trim() } : {}),
          ...(form.tin.trim() ? { tin: form.tin.trim() } : {}),
        });
      } else {
        await updatePayee(edit.payee.id, {
          name: form.name.trim(),
          address: form.address.trim(),
          tin: form.tin.trim(),
        });
      }
      setEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Payee) {
    setBusy(true);
    setError('');
    try {
      await updatePayee(p.id, { isActive: !p.isActive });
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function doMerge() {
    if (!mergeSource || !mergeTargetId) return;
    setBusy(true);
    setError('');
    try {
      await mergePayee(mergeSource.id, mergeTargetId);
      setMergeSource(null);
      setMergeTargetId('');
      await load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Merge failed.');
    } finally {
      setBusy(false);
    }
  }

  const mergeTargets = (payees ?? []).filter((p) => p.isActive && p.id !== mergeSource?.id);

  return (
    <div>
      <h2>List of Payees</h2>
      <p className="reports-subtitle">
        The district&apos;s master list of payees and suppliers — name, address and TIN. Payees can
        be edited, merged to clean up duplicates, or deactivated, but never deleted.
      </p>

      {error && (
        <div className="reports-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="acct-toolbar" style={{ marginBottom: 14 }}>
        <input
          type="search"
          placeholder="Search name, TIN, or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260, flex: '1 1 260px' }}
          aria-label="Search payees"
        />
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475467' }}
        >
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button type="button" className="acct-btn acct-btn--primary" onClick={openNew}>
          + Add new Payee
        </button>
      </div>

      {/* Add / Edit form */}
      {edit && (
        <div
          className="acct-form"
          style={{
            border: '1px solid #d0d5dd',
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
            maxWidth: 720,
            background: '#fcfcfd',
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>
            {edit.mode === 'new' ? 'New Payee' : `Edit — ${edit.payee.name}`}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>Payee name *</span>
              <input
                style={input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>TIN</span>
              <input
                style={input}
                value={form.tin}
                onChange={(e) => setForm({ ...form, tin: e.target.value })}
                placeholder="000-000-000-00000"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <span style={label}>Address</span>
              <input
                style={input}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              disabled={!form.name.trim() || busy}
              onClick={save}
            >
              {busy ? 'Saving…' : edit.mode === 'new' ? 'Add payee' : 'Save changes'}
            </button>
            <button type="button" className="acct-btn" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Merge panel */}
      {mergeSource && (
        <div
          style={{
            border: '1px solid #fcd34d',
            background: '#fffbeb',
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
            maxWidth: 720,
          }}
        >
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Merge payee</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475467' }}>
            Merge <strong>{mergeSource.name}</strong> into another payee. The other payee survives;{' '}
            <strong>{mergeSource.name}</strong> is deactivated and kept for the record.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              style={{ ...input, maxWidth: 360 }}
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
            >
              <option value="">Merge into…</option>
              {mergeTargets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.tin ? ` (${p.tin})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              disabled={!mergeTargetId || busy}
              onClick={doMerge}
            >
              Merge
            </button>
            <button
              type="button"
              className="acct-btn"
              onClick={() => {
                setMergeSource(null);
                setMergeTargetId('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!payees ? (
        <div className="reports-loading">Loading…</div>
      ) : payees.length === 0 ? (
        <div className="reports-loading">
          {search ? 'No payees match your search.' : 'No payees yet. Add one to get started.'}
        </div>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Payee Name</th>
                <th>Address</th>
                <th>TIN</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payees.map((p) => (
                <tr key={p.id} style={{ opacity: p.isActive ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.address || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.tin || '—'}</td>
                  <td>
                    <span className="acct-badge">{p.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="acct-btn acct-btn--sm"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="acct-btn acct-btn--sm"
                        disabled={!p.isActive}
                        onClick={() => {
                          setMergeSource(p);
                          setMergeTargetId('');
                          setEdit(null);
                        }}
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        className="acct-btn acct-btn--sm"
                        disabled={busy}
                        onClick={() => toggleActive(p)}
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
