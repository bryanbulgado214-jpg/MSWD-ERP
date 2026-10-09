import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  getPurchaseRequest,
  listAvailableBudgetReleases,
  listLookupDepartments,
  ProcurementApiError,
  updatePurchaseRequest,
  type BudgetReleaseOption,
  type LookupDepartment,
} from '../api';
import type { ItemClassification, PurchaseRequest } from '../types';
import './procurement.css';

const CLASSIFICATION_OPTIONS: { value: ItemClassification; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'asset', label: 'Asset' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'service', label: 'Service' },
];

// Qty and Unit Cost are held as raw text while editing so the field can be
// cleared (no "stuck 0") and typed freely; they are parsed to numbers on save.
interface FormItem {
  description: string;
  quantity: string;
  unitOfMeasure: string;
  estimatedUnitCost: string;
  accountCode?: string;
  technicalSpecification?: string;
  classification?: ItemClassification;
}

// Parse a typed number field; blank / partial / invalid reads as 0.
function toNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// Keep only digits and a single decimal point as the user types.
function numericText(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

export function EditPurchaseRequestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [releases, setReleases] = useState<BudgetReleaseOption[]>([]);
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  const [budgetReleaseId, setBudgetReleaseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getPurchaseRequest(id), listAvailableBudgetReleases(), listLookupDepartments()])
      .then(([prData, relData, deptData]) => {
        if (!['draft', 'returned', 'procurement_in_progress'].includes(prData.status)) {
          setError(`This PR cannot be edited (status: ${prData.status}).`);
          return;
        }
        setPr(prData);
        setReleases(relData);
        setDepartments(deptData);
        setBudgetReleaseId(prData.budgetReleaseId ?? '');
        setTitle(prData.title);
        setDescription(prData.description ?? '');
        setPurpose(prData.purpose ?? '');
        setDepartmentId(prData.departmentId ?? '');
        setRequestedDeliveryDate(
          prData.requestedDeliveryDate ? prData.requestedDeliveryDate.slice(0, 10) : '',
        );
        setItems(
          prData.items.map((item) => ({
            description: item.description,
            quantity: String(parseFloat(item.quantity)),
            unitOfMeasure: item.unitOfMeasure,
            estimatedUnitCost: String(parseFloat(item.estimatedUnitCost)),
            ...(item.accountCode ? { accountCode: item.accountCode } : {}),
            ...(item.technicalSpecification
              ? { technicalSpecification: item.technicalSpecification }
              : {}),
            ...(item.classification ? { classification: item.classification } : {}),
          })),
        );
      })
      .catch((err) =>
        setError(err instanceof ProcurementApiError ? err.message : 'Failed to load.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  function updateItem(index: number, patch: Partial<FormItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const itemsRef = useRef<HTMLDivElement>(null);
  const [addedTick, setAddedTick] = useState(0);

  function addItem() {
    // A new line starts empty (blank quantity) so it is simply ignored until
    // filled in — it never blocks Save.
    setItems((prev) => [
      ...prev,
      { description: '', quantity: '', unitOfMeasure: 'pc', estimatedUnitCost: '' },
    ]);
    setAddedTick((t) => t + 1);
  }

  // After an item is added, scroll it into view and focus it.
  useEffect(() => {
    if (addedTick === 0) return;
    const cards = itemsRef.current?.querySelectorAll('.pr-item-card');
    const last = cards?.[cards.length - 1] as HTMLElement | undefined;
    last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (last?.querySelector('input') as HTMLInputElement | undefined)?.focus({ preventScroll: true });
  }, [addedTick]);

  // An item with a blank / zero quantity is treated as "not ordering this line"
  // and is simply left out on save — so to drop a line from the PR you clear its
  // quantity (e.g. for PR items a PO didn't cover). Only the kept lines must be
  // fully filled in.
  const keptItems = items.filter((item) => toNumber(item.quantity) > 0);
  const totalAmount = keptItems.reduce(
    (sum, item) => sum + toNumber(item.quantity) * toNumber(item.estimatedUnitCost),
    0,
  );
  const selectedRelease = releases.find((r) => r.id === budgetReleaseId);

  // A budget release is NOT required here — PRs can be created without one, so
  // requiring it on edit would leave those PRs permanently unsaveable (the Save
  // button greyed out with no explanation). Only a title and the kept items are
  // required, matching the create form and the API.
  const itemsOk =
    keptItems.length > 0 &&
    keptItems.every(
      (item) =>
        item.description.trim() &&
        toNumber(item.quantity) > 0 &&
        toNumber(item.estimatedUnitCost) > 0 &&
        item.unitOfMeasure.trim(),
    );
  const canSubmit = Boolean(pr && title.trim() && itemsOk && !submitting);

  // Surface why Save is disabled so the user is never stuck guessing.
  const missing: string[] = [];
  if (!title.trim()) missing.push('a title');
  if (keptItems.length === 0) missing.push('at least one item with a quantity above 0');
  else if (!itemsOk)
    missing.push('each kept item (quantity above 0) to have a description, unit, and a unit cost above 0');

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
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
        ...(budgetReleaseId ? { budgetReleaseId } : {}),
        items: keptItems.map((item) => ({
          description: item.description.trim(),
          quantity: toNumber(item.quantity),
          unitOfMeasure: item.unitOfMeasure.trim(),
          estimatedUnitCost: toNumber(item.estimatedUnitCost),
          ...(item.accountCode?.trim() ? { accountCode: item.accountCode.trim() } : {}),
          ...(item.technicalSpecification?.trim()
            ? { technicalSpecification: item.technicalSpecification.trim() }
            : {}),
          ...(item.classification ? { classification: item.classification } : {}),
        })),
      });
      navigate(`/procurement/purchase-requests/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="pr-page">
        <p style={{ color: '#667085' }}>Loading...</p>
      </div>
    );
  if (error && !pr)
    return (
      <div className="pr-page">
        <div className="pr-error">{error}</div>
      </div>
    );

  return (
    <div className="pr-page">
      <a
        href={`/procurement/purchase-requests/${id}`}
        className="pr-back"
        onClick={(e) => {
          e.preventDefault();
          navigate(`/procurement/purchase-requests/${id}`);
        }}
      >
        &larr; Back to {pr?.prNumber}
      </a>
      <h1>Edit {pr?.prNumber}</h1>

      {pr?.status === 'returned' && (
        <div
          className="pr-terminal-banner pr-terminal-banner--returned"
          style={{ marginBottom: 20 }}
        >
          <div>
            This PR was returned for correction. Edit and resubmit when ready. Saving will reset
            status to Draft.
          </div>
          {pr.remarks && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.05)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <strong>Reason:</strong> {pr.remarks}
            </div>
          )}
        </div>
      )}

      {error && <div className="pr-error">{error}</div>}

      <form className="pr-form" onSubmit={handleSubmit}>
        <div className="pr-form-grid">
          <div className="pr-field">
            <label>Budget Release</label>
            {releases.length === 0 && !budgetReleaseId ? (
              <p style={{ color: '#667085', fontSize: 13 }}>No released budgets available.</p>
            ) : (
              <select value={budgetReleaseId} onChange={(e) => setBudgetReleaseId(e.target.value)}>
                <option value="">— None —</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.releaseNumber} — {r.budgetHeader.responsibilityCenter.name} /{' '}
                    {r.budgetHeader.fundSource.name} (Avail: {formatPeso(r.availableAmount)})
                  </option>
                ))}
                {/* Keep the PR's existing release selectable even when it is no
                    longer in the "available" list, so editing never silently
                    drops it. */}
                {budgetReleaseId && !releases.some((r) => r.id === budgetReleaseId) && (
                  <option value={budgetReleaseId}>
                    {pr?.budgetRelease?.releaseNumber ?? 'Current release'} (current)
                  </option>
                )}
              </select>
            )}
            {selectedRelease && (
              <p style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                Released: {formatPeso(selectedRelease.releasedAmount)} | Available:{' '}
                {formatPeso(selectedRelease.availableAmount)}
              </p>
            )}
          </div>

          <div className="pr-field">
            <label>Department</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Select department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pr-field">
          <label>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={255}
          />
        </div>

        <div className="pr-form-grid">
          <div className="pr-field">
            <label>Purpose / Justification</label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Why is this procurement needed?"
              rows={2}
            />
          </div>

          <div className="pr-field">
            <label>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="pr-form-grid">
          <div className="pr-field">
            <label>Requested Delivery Date</label>
            <input
              type="date"
              value={requestedDeliveryDate}
              onChange={(e) => setRequestedDeliveryDate(e.target.value)}
            />
          </div>
          <div></div>
        </div>

        <div>
          <div className="pr-items-header">
            <h3>Items</h3>
            <button type="button" className="pr-btn" onClick={addItem}>
              + Add Item
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#667085', margin: '0 0 10px' }}>
            Tip: clear an item's quantity to leave it off this PR (e.g. lines a PO didn't cover).
          </p>

          <div ref={itemsRef}>
          {items.map((item, idx) => (
            <div key={idx} className="pr-item-card">
              {items.length > 1 && (
                <button
                  type="button"
                  className="pr-item-card__remove"
                  onClick={() => removeItem(idx)}
                  title="Remove item"
                >
                  &times;
                </button>
              )}
              <div className="pr-item-grid">
                <div>
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    maxLength={500}
                  />
                </div>
                <div>
                  <label>Qty</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: numericText(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label>Unit</label>
                  <input
                    type="text"
                    value={item.unitOfMeasure}
                    onChange={(e) => updateItem(idx, { unitOfMeasure: e.target.value })}
                    maxLength={20}
                  />
                </div>
                <div>
                  <label>Unit Cost</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.estimatedUnitCost}
                    onChange={(e) =>
                      updateItem(idx, { estimatedUnitCost: numericText(e.target.value) })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginTop: 8 }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#475467',
                      marginBottom: 2,
                    }}
                  >
                    Technical Specification
                  </label>
                  <input
                    type="text"
                    value={item.technicalSpecification ?? ''}
                    onChange={(e) => updateItem(idx, { technicalSpecification: e.target.value })}
                    placeholder="e.g. A4, 80gsm, 500 sheets/ream"
                    maxLength={500}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1.5px solid #d0d5dd',
                      borderRadius: 4,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#475467',
                      marginBottom: 2,
                    }}
                  >
                    Classification
                  </label>
                  <select
                    value={item.classification ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        updateItem(idx, { classification: value as ItemClassification });
                      } else {
                        setItems((prev) =>
                          prev.map((it, i) => {
                            if (i !== idx) return it;
                            const rest = { ...it };
                            delete rest.classification;
                            return rest;
                          }),
                        );
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1.5px solid #d0d5dd',
                      borderRadius: 4,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">—</option>
                    {CLASSIFICATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p style={{ textAlign: 'right', fontSize: 12, color: '#475467', margin: '8px 0 0' }}>
                Line total:{' '}
                {formatPeso((toNumber(item.quantity) * toNumber(item.estimatedUnitCost)).toFixed(2))}
              </p>
            </div>
          ))}
          </div>

          <p
            style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)' }}
          >
            Total: {formatPeso(totalAmount.toFixed(2))}
          </p>
        </div>

        {!canSubmit && !submitting && missing.length > 0 && (
          <p style={{ textAlign: 'right', fontSize: 12, color: '#b42318', margin: '0 0 8px' }}>
            To save, you still need: {missing.join('; ')}.
          </p>
        )}
        <div className="pr-form-actions">
          <button type="submit" className="pr-btn pr-btn--primary" disabled={!canSubmit}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
