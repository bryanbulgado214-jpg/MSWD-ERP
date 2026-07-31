import { useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  createSupplier,
  listSuppliers,
  ProcurementApiError,
  updateSupplier,
} from '../api';
import type { Supplier } from '../types';
import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Supplier[] };

interface SupplierForm {
  name: string;
  tin: string;
  address: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
}

const EMPTY_FORM: SupplierForm = {
  name: '',
  tin: '',
  address: '',
  contactPerson: '',
  contactNumber: '',
  email: '',
};

export function SupplierListPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('procurement.supplier.manage');

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setState({ status: 'loading' });
    listSuppliers(showInactive)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) => setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load suppliers.' }));
  }

  useEffect(() => { load(); }, [showInactive]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError('');
  }

  function openEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      tin: s.tin ?? '',
      address: s.address ?? '',
      contactPerson: s.contactPerson ?? '',
      contactNumber: s.contactNumber ?? '',
      email: s.email ?? '',
    });
    setShowForm(true);
    setError('');
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Supplier name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const existing = state.status === 'loaded' ? state.data.find((s) => s.id === editingId) : undefined;
        await updateSupplier(editingId, {
          expectedVersion: existing?.version ?? 1,
          name: form.name.trim(),
          ...(form.tin ? { tin: form.tin.trim() } : {}),
          ...(form.address ? { address: form.address.trim() } : {}),
          ...(form.contactPerson ? { contactPerson: form.contactPerson.trim() } : {}),
          ...(form.contactNumber ? { contactNumber: form.contactNumber.trim() } : {}),
          ...(form.email ? { email: form.email.trim() } : {}),
        });
      } else {
        await createSupplier({
          name: form.name.trim(),
          ...(form.tin ? { tin: form.tin.trim() } : {}),
          ...(form.address ? { address: form.address.trim() } : {}),
          ...(form.contactPerson ? { contactPerson: form.contactPerson.trim() } : {}),
          ...(form.contactNumber ? { contactNumber: form.contactNumber.trim() } : {}),
          ...(form.email ? { email: form.email.trim() } : {}),
        });
      }
      setShowForm(false);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Supplier) {
    try {
      await updateSupplier(s.id, { expectedVersion: s.version, isActive: !s.isActive });
      load();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Update failed.');
    }
  }

  function setField(field: keyof SupplierForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Suppliers</h1>

      <div className="pr-toolbar">
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        {canManage && (
          <button className="pr-btn pr-btn--primary" onClick={openCreate}>
            + New Supplier
          </button>
        )}
      </div>

      {error && <div className="pr-error">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8f9fc', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div className="pr-form" style={{ gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pr-field">
                <label>Supplier Name *</label>
                <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div className="pr-field">
                <label>TIN</label>
                <input value={form.tin} onChange={(e) => setField('tin', e.target.value)} />
              </div>
            </div>
            <div className="pr-field">
              <label>Address</label>
              <input value={form.address} onChange={(e) => setField('address', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="pr-field">
                <label>Contact Person</label>
                <input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} />
              </div>
              <div className="pr-field">
                <label>Contact Number</label>
                <input value={form.contactNumber} onChange={(e) => setField('contactNumber', e.target.value)} />
              </div>
              <div className="pr-field">
                <label>Email</label>
                <input value={form.email} onChange={(e) => setField('email', e.target.value)} />
              </div>
            </div>
            <div className="pr-form-actions">
              <button type="button" className="pr-btn" onClick={cancelForm}>Cancel</button>
              <button type="submit" className="pr-btn pr-btn--primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Supplier' : 'Create Supplier'}
              </button>
            </div>
          </div>
        </form>
      )}

      {state.status === 'loading' && <div className="pr-empty">Loading suppliers...</div>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No suppliers found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="pr-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>TIN</th>
              <th>Contact Person</th>
              <th>Contact Number</th>
              <th>Status</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {state.data.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td>{s.tin ?? '—'}</td>
                <td>{s.contactPerson ?? '—'}</td>
                <td>{s.contactNumber ?? '—'}</td>
                <td>
                  <span className={`pr-badge ${s.isActive ? 'pr-badge--approved' : 'pr-badge--cancelled'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {canManage && (
                  <td>
                    <button className="pr-btn" style={{ marginRight: 6, padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(s)}>Edit</button>
                    <button
                      className={`pr-btn ${s.isActive ? 'pr-btn--danger' : 'pr-btn--success'}`}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => toggleActive(s)}
                    >
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
