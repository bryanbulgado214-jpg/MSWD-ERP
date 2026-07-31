import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  getPurchaseRequest,
  listAvailableBudgetReleases,
  ProcurementApiError,
  updatePurchaseRequest,
  type BudgetReleaseOption,
} from '../api';
import type { CreatePurchaseRequestItemInput, PurchaseRequest } from '../types';
import './procurement.css';

export function EditPurchaseRequestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [releases, setReleases] = useState<BudgetReleaseOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [budgetReleaseId, setBudgetReleaseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<CreatePurchaseRequestItemInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getPurchaseRequest(id), listAvailableBudgetReleases()])
      .then(([prData, relData]) => {
        if (prData.status !== 'draft' && prData.status !== 'returned') {
          setError(`This PR cannot be edited (status: ${prData.status}).`);
          return;
        }
        setPr(prData);
        setReleases(relData);
        setBudgetReleaseId(prData.budgetReleaseId ?? '');
        setTitle(prData.title);
        setDescription(prData.description ?? '');
        setItems(
          prData.items.map((item) => ({
            description: item.description,
            quantity: parseFloat(item.quantity),
            unitOfMeasure: item.unitOfMeasure,
            estimatedUnitCost: parseFloat(item.estimatedUnitCost),
            ...(item.accountCode ? { accountCode: item.accountCode } : {}),
          })),
        );
      })
      .catch((err) => setError(err instanceof ProcurementApiError ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false));
  }, [id]);

  function updateItem(index: number, patch: Partial<CreatePurchaseRequestItemInput>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 0 }]);
  }

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCost, 0);
  const selectedRelease = releases.find((r) => r.id === budgetReleaseId);

  const canSubmit =
    pr &&
    budgetReleaseId &&
    title.trim() &&
    items.length > 0 &&
    items.every((item) => item.description.trim() && item.quantity > 0 && item.estimatedUnitCost > 0 && item.unitOfMeasure.trim()) &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !pr || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await updatePurchaseRequest(id, {
        expectedVersion: pr.version,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(budgetReleaseId ? { budgetReleaseId } : {}),
        items: items.map((item) => ({
          description: item.description.trim(),
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure.trim(),
          estimatedUnitCost: item.estimatedUnitCost,
          ...(item.accountCode?.trim() ? { accountCode: item.accountCode.trim() } : {}),
        })),
      });
      navigate(`/procurement/purchase-requests/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="pr-page"><p style={{ color: '#667085' }}>Loading...</p></div>;
  if (error && !pr) return <div className="pr-page"><div className="pr-error">{error}</div></div>;

  return (
    <div className="pr-page">
      <a href={`/procurement/purchase-requests/${id}`} className="pr-back" onClick={(e) => { e.preventDefault(); navigate(`/procurement/purchase-requests/${id}`); }}>
        &larr; Back to {pr?.prNumber}
      </a>
      <h1>Edit {pr?.prNumber}</h1>

      {pr?.status === 'returned' && (
        <div className="pr-terminal-banner pr-terminal-banner--returned" style={{ marginBottom: 20 }}>
          <div>This PR was returned for correction. Edit and resubmit when ready. Saving will reset status to Draft.</div>
          {pr.remarks && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, fontSize: 13 }}>
              <strong>Reason:</strong> {pr.remarks}
            </div>
          )}
        </div>
      )}

      {error && <div className="pr-error">{error}</div>}

      <form className="pr-form" onSubmit={handleSubmit}>
        <div className="pr-field">
          <label>Budget Release</label>
          {releases.length === 0 ? (
            <p style={{ color: '#b42318', fontSize: 13 }}>No released budgets available.</p>
          ) : (
            <select value={budgetReleaseId} onChange={(e) => setBudgetReleaseId(e.target.value)} required>
              <option value="">Select a budget release...</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.releaseNumber} — {r.budgetHeader.responsibilityCenter.name} / {r.budgetHeader.fundSource.name} (Available: {formatPeso(r.availableAmount)})
                </option>
              ))}
            </select>
          )}
          {selectedRelease && (
            <p style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
              Released: {formatPeso(selectedRelease.releasedAmount)} | Available: {formatPeso(selectedRelease.availableAmount)}
            </p>
          )}
        </div>

        <div className="pr-field">
          <label>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255} />
        </div>

        <div className="pr-field">
          <label>Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <div className="pr-items-header">
            <h3>Items</h3>
            <button type="button" className="pr-btn" onClick={addItem}>+ Add Item</button>
          </div>

          {items.map((item, idx) => (
            <div key={idx} className="pr-item-card">
              {items.length > 1 && (
                <button type="button" className="pr-item-card__remove" onClick={() => removeItem(idx)} title="Remove item">&times;</button>
              )}
              <div className="pr-item-grid">
                <div>
                  <label>Description</label>
                  <input type="text" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} required maxLength={500} />
                </div>
                <div>
                  <label>Qty</label>
                  <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} min={0.0001} step="any" required />
                </div>
                <div>
                  <label>Unit</label>
                  <input type="text" value={item.unitOfMeasure} onChange={(e) => updateItem(idx, { unitOfMeasure: e.target.value })} required maxLength={20} />
                </div>
                <div>
                  <label>Unit Cost</label>
                  <input type="number" value={item.estimatedUnitCost} onChange={(e) => updateItem(idx, { estimatedUnitCost: parseFloat(e.target.value) || 0 })} min={0.01} step="0.01" required />
                </div>
              </div>
              <p style={{ textAlign: 'right', fontSize: 12, color: '#475467', margin: '8px 0 0' }}>
                Line total: {formatPeso((item.quantity * item.estimatedUnitCost).toFixed(2))}
              </p>
            </div>
          ))}

          <p style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)' }}>
            Total: {formatPeso(totalAmount.toFixed(2))}
          </p>
        </div>

        <div className="pr-form-actions">
          <button type="button" className="pr-btn" onClick={() => navigate(`/procurement/purchase-requests/${id}`)}>Cancel</button>
          <button type="submit" className="pr-btn pr-btn--primary" disabled={!canSubmit}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
