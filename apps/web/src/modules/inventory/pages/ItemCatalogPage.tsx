import { useEffect, useState } from 'react';
import { useAuth } from '../../../app/auth';
import { formatPeso } from '../../budgeting/format-peso';
import { createInventoryItem, getInventoryItems, InventoryApiError, updateInventoryItem } from '../api';
import type { InventoryClassification, InventoryItem } from '../types';
import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: InventoryItem[] };

export default function ItemCatalogPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [itemCode, setItemCode] = useState('');
  const [description, setDescription] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('');
  const [classification, setClassification] = useState<InventoryClassification>('expendable');
  const [category, setCategory] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [editVersion, setEditVersion] = useState(0);

  const canManage = hasPermission('inventory.item.manage');

  async function load() {
    try {
      const params = new URLSearchParams();
      if (classFilter) params.set('classification', classFilter);
      if (search) params.set('search', search);
      const data = await getInventoryItems(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({ status: 'error', message: e instanceof InventoryApiError ? e.message : 'Failed to load items.' });
    }
  }

  useEffect(() => { load(); }, [classFilter, search]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setItemCode(''); setDescription(''); setUnitOfMeasure('');
    setClassification('expendable'); setCategory(''); setAccountCode('');
    setReorderPoint(''); setFormError('');
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setItemCode(item.itemCode);
    setDescription(item.description);
    setUnitOfMeasure(item.unitOfMeasure);
    setClassification(item.classification);
    setCategory(item.category ?? '');
    setAccountCode(item.accountCode ?? '');
    setReorderPoint(item.reorderPoint ? String(item.reorderPoint) : '');
    setEditVersion(item.version);
    setShowForm(true);
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await updateInventoryItem(editingId, {
          expectedVersion: editVersion,
          description,
          unitOfMeasure,
          ...(category ? { category } : {}),
          ...(accountCode ? { accountCode } : {}),
          ...(reorderPoint ? { reorderPoint: Number(reorderPoint) } : {}),
        });
      } else {
        await createInventoryItem({
          itemCode, description, unitOfMeasure, classification,
          ...(category ? { category } : {}),
          ...(accountCode ? { accountCode } : {}),
          ...(reorderPoint ? { reorderPoint: Number(reorderPoint) } : {}),
        });
      }
      resetForm();
      load();
    } catch (e) {
      setFormError(e instanceof InventoryApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Item Catalog</h1>

      <div className="inv-toolbar">
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">All Classifications</option>
          <option value="expendable">Expendable</option>
          <option value="semi_expendable">Semi-Expendable</option>
          <option value="ppe">PPE</option>
        </select>
        <input
          type="text" placeholder="Search items..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        {canManage && (
          <button className="inv-btn inv-btn--primary" onClick={() => { resetForm(); setShowForm(true); }}>
            + New Item
          </button>
        )}
      </div>

      {formError && <div className="inv-error">{formError}</div>}

      {showForm && (
        <form className="inv-form" onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="inv-field">
              <label>Item Code</label>
              <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} required disabled={!!editingId} />
            </div>
            <div className="inv-field">
              <label>Classification</label>
              <select value={classification} onChange={(e) => setClassification(e.target.value as InventoryClassification)} disabled={!!editingId}>
                <option value="expendable">Expendable</option>
                <option value="semi_expendable">Semi-Expendable</option>
                <option value="ppe">PPE</option>
              </select>
            </div>
            <div className="inv-field" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="inv-field">
              <label>Unit of Measure</label>
              <input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} required />
            </div>
            <div className="inv-field">
              <label>Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="inv-field">
              <label>Account Code</label>
              <input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} />
            </div>
            <div className="inv-field">
              <label>Reorder Point</label>
              <input type="number" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
            </div>
          </div>
          <div className="inv-form-actions">
            <button type="button" className="inv-btn" onClick={resetForm}>Cancel</button>
            <button type="submit" className="inv-btn inv-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <div className="inv-empty">Loading...</div>}
      {state.status === 'error' && <div className="inv-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && <div className="inv-empty">No inventory items found.</div>}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="inv-table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Description</th>
              <th>Classification</th>
              <th>UOM</th>
              <th style={{ textAlign: 'right' }}>On Hand</th>
              <th style={{ textAlign: 'right' }}>Unit Cost</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {state.data.map((item) => (
              <tr key={item.id}>
                <td><span className="inv-table__link">{item.itemCode}</span></td>
                <td>{item.description}</td>
                <td><span className={`inv-badge inv-badge--${item.classification}`}>{item.classification.replace('_', ' ')}</span></td>
                <td>{item.unitOfMeasure}</td>
                <td className="inv-text-right inv-text-mono">{Number(item.onHandQuantity)}</td>
                <td className="inv-text-right inv-text-mono">{formatPeso(item.unitCost)}</td>
                {canManage && (
                  <td>
                    <button className="inv-btn" onClick={() => startEdit(item)} style={{ padding: '4px 10px', fontSize: '12px' }}>Edit</button>
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
