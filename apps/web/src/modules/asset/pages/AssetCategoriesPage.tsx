import { useEffect, useState } from 'react';
import { getCategories, createCategory, updateCategory } from '../api';
import type { AssetCategory } from '../types';
import AssetSubNav from './AssetSubNav';
import '../asset.css';

interface CategoryFormData {
  code: string;
  name: string;
  description: string;
  depreciationMethod: string;
  defaultUsefulLife: string;
  ppeAccountCode: string;
  accumDeprAccountCode: string;
  deprExpenseAccountCode: string;
}

const EMPTY_FORM: CategoryFormData = {
  code: '',
  name: '',
  description: '',
  depreciationMethod: 'straight_line',
  defaultUsefulLife: '',
  ppeAccountCode: '',
  accumDeprAccountCode: '',
  deprExpenseAccountCode: '',
};

export default function AssetCategoriesPage() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function loadCategories() {
    setLoading(true);
    setError('');
    getCategories()
      .then(setCategories)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load categories'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadCategories(); }, []);

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(cat: AssetCategory) {
    setEditId(cat.id);
    setForm({
      code: cat.code,
      name: cat.name,
      description: cat.description ?? '',
      depreciationMethod: cat.depreciationMethod,
      defaultUsefulLife: cat.defaultUsefulLife != null ? String(cat.defaultUsefulLife) : '',
      ppeAccountCode: cat.ppeAccountCode ?? '',
      accumDeprAccountCode: cat.accumDeprAccountCode ?? '',
      deprExpenseAccountCode: cat.deprExpenseAccountCode ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Code and Name are required.');
      return;
    }
    setSaving(true);
    setFormError('');

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      depreciationMethod: form.depreciationMethod,
      ...(form.defaultUsefulLife ? { defaultUsefulLife: Number(form.defaultUsefulLife) } : {}),
      ...(form.ppeAccountCode.trim() ? { ppeAccountCode: form.ppeAccountCode.trim() } : {}),
      ...(form.accumDeprAccountCode.trim() ? { accumDeprAccountCode: form.accumDeprAccountCode.trim() } : {}),
      ...(form.deprExpenseAccountCode.trim() ? { deprExpenseAccountCode: form.deprExpenseAccountCode.trim() } : {}),
    };

    try {
      if (editId) {
        await updateCategory(editId, payload);
      } else {
        await createCategory(payload);
      }
      cancelForm();
      loadCategories();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(cat: AssetCategory) {
    try {
      await updateCategory(cat.id, { isActive: !cat.isActive });
      loadCategories();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  function setField(key: keyof CategoryFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="am-page">
      <AssetSubNav />
      <div className="am-page__header">
        <h1>Asset Categories</h1>
        <div className="am-page__actions">
          {!showForm && (
            <button type="button" className="am-btn am-btn--primary" onClick={openAdd}>
              + Add Category
            </button>
          )}
        </div>
      </div>

      {error && <div className="am-error">{error}</div>}

      {showForm && (
        <div className="am-inline-form">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>
            {editId ? 'Edit Category' : 'New Category'}
          </h2>
          {formError && <div className="am-error">{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="am-form__grid">
              <div className="am-form__field">
                <label className="am-form__label">Code *</label>
                <input className="am-input" value={form.code} onChange={(e) => setField('code', e.target.value)} />
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Name *</label>
                <input className="am-input" value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div className="am-form__field am-form__field--full">
                <label className="am-form__label">Description</label>
                <input className="am-input" value={form.description} onChange={(e) => setField('description', e.target.value)} />
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Depreciation Method</label>
                <select className="am-select" value={form.depreciationMethod} onChange={(e) => setField('depreciationMethod', e.target.value)}>
                  <option value="straight_line">Straight Line</option>
                </select>
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Default Useful Life (years)</label>
                <input className="am-input" type="number" min="1" value={form.defaultUsefulLife} onChange={(e) => setField('defaultUsefulLife', e.target.value)} />
              </div>
              <div className="am-form__field">
                <label className="am-form__label">PPE Account Code</label>
                <input className="am-input" value={form.ppeAccountCode} onChange={(e) => setField('ppeAccountCode', e.target.value)} />
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Accum Depr Account Code</label>
                <input className="am-input" value={form.accumDeprAccountCode} onChange={(e) => setField('accumDeprAccountCode', e.target.value)} />
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Depr Expense Account Code</label>
                <input className="am-input" value={form.deprExpenseAccountCode} onChange={(e) => setField('deprExpenseAccountCode', e.target.value)} />
              </div>
            </div>
            <div className="am-form__actions">
              <button type="submit" className="am-btn am-btn--primary" disabled={saving}>
                {saving ? 'Saving...' : (editId ? 'Update' : 'Create')}
              </button>
              <button type="button" className="am-btn" onClick={cancelForm} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="am-loading">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="am-empty">No categories found.</div>
      ) : (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Depreciation Method</th>
                <th>Useful Life (yrs)</th>
                <th>PPE Account</th>
                <th>Accum Depr Account</th>
                <th>Depr Expense Account</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} onClick={() => openEdit(cat)}>
                  <td>{cat.code}</td>
                  <td>{cat.name}</td>
                  <td>{cat.depreciationMethod === 'straight_line' ? 'Straight Line' : cat.depreciationMethod}</td>
                  <td>{cat.defaultUsefulLife ?? '—'}</td>
                  <td>{cat.ppeAccountCode ?? '—'}</td>
                  <td>{cat.accumDeprAccountCode ?? '—'}</td>
                  <td>{cat.deprExpenseAccountCode ?? '—'}</td>
                  <td>
                    <span className={`am-badge ${cat.isActive ? 'am-badge--active' : 'am-badge--inactive'}`}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`am-btn am-btn--sm ${cat.isActive ? 'am-btn--warning' : 'am-btn--success'}`}
                      onClick={(e) => { e.stopPropagation(); toggleActive(cat); }}
                    >
                      {cat.isActive ? 'Deactivate' : 'Activate'}
                    </button>
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
