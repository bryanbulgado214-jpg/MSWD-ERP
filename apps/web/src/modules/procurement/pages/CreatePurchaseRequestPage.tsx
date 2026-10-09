import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  createPurchaseRequest,
  listAllocationsForEndUser,
  listAppItems,
  listEndUsers,
  listLookupDepartments,
  listProcurementFiscalYears,
  ProcurementApiError,
  type AppItem,
  type EndUser,
  type LookupDepartment,
  type PpmpItemWithRemaining,
  type ProcurementFiscalYear,
} from '../api';
import type { CreatePurchaseRequestItemInput } from '../types';

import { AcquisitionsModal } from './AcquisitionsModal';
import { EndUserPicker } from './EndUserPicker';
import './procurement.css';

function emptyItem(): CreatePurchaseRequestItemInput {
  return { description: '', quantity: 1, unitOfMeasure: 'pc', estimatedUnitCost: 0 };
}

export function CreatePurchaseRequestPage() {
  const navigate = useNavigate();
  const [fiscalYears, setFiscalYears] = useState<ProcurementFiscalYear[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [myPpmpItems, setMyPpmpItems] = useState<PpmpItemWithRemaining[]>([]);
  const [loadingPpmp, setLoadingPpmp] = useState(false);
  const [acqModal, setAcqModal] = useState<{
    id: string;
    code: string;
    description: string;
  } | null>(null);
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [appItems, setAppItems] = useState<AppItem[]>([]);
  // The purchase officer prepares every PR; the end-user who initiated the
  // request is selected here so their PPMP allocations can be drawn from.
  const [endUsers, setEndUsers] = useState<EndUser[]>([]);
  const [endUserId, setEndUserId] = useState('');
  // Free-text filter over the PPMP allocations table (code / description / unit),
  // so a long allocation list is quick to search.
  const [ppmpSearch, setPpmpSearch] = useState('');

  const [prNumber, setPrNumber] = useState('');
  const [prDate, setPrDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [appItemId, setAppItemId] = useState('');
  const [items, setItems] = useState<CreatePurchaseRequestItemInput[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listProcurementFiscalYears(), listLookupDepartments(), listEndUsers()])
      .then(([fyData, deptData, endUserData]) => {
        setFiscalYears(fyData);
        const firstFy = fyData[0];
        if (firstFy) setSelectedFiscalYear(firstFy.id);
        setDepartments(deptData);
        setEndUsers(endUserData);
      })
      .catch(() => setError('Failed to load form data.'));
  }, []);

  useEffect(() => {
    if (!selectedFiscalYear) return;
    let cancelled = false;
    // A new end-user means new allocations — clear any allocation-derived lines.
    setItems([emptyItem()]);
    setAppItemId('');
    // PPMP allocations belong to the end-user who initiated the request; load
    // them only once the officer has picked that end-user.
    setLoadingPpmp(!!endUserId);
    Promise.all([
      endUserId
        ? listAllocationsForEndUser(endUserId, selectedFiscalYear)
        : Promise.resolve([] as PpmpItemWithRemaining[]),
      listAppItems({ fiscalYearId: selectedFiscalYear, status: 'approved' }),
    ])
      .then(([ppmpData, appData]) => {
        if (!cancelled) {
          setMyPpmpItems(ppmpData);
          setAppItems(appData);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPpmp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFiscalYear, endUserId]);

  // Multi-select: each checked allocation becomes a PR line that remembers its
  // PPMP item; unchecking removes that line. Manual (non-PPMP) lines are kept.
  function toggleAllocation(ppmp: PpmpItemWithRemaining) {
    const already = items.some((it) => it.ppmpItemId === ppmp.id);
    if (already) {
      setItems((prev) => {
        const next = prev.filter((it) => it.ppmpItemId !== ppmp.id);
        return next.length ? next : [emptyItem()];
      });
      return;
    }
    const line: CreatePurchaseRequestItemInput = {
      description: ppmp.itemDescription,
      quantity: parseFloat(ppmp.remainingQuantity) || 0,
      unitOfMeasure: ppmp.unitOfMeasure,
      estimatedUnitCost: parseFloat(ppmp.estimatedUnitCost) || 0,
      ppmpItemId: ppmp.id,
    };
    setItems((prev) => {
      const onlyEmpty = prev.length === 1 && !prev[0]?.description && !prev[0]?.ppmpItemId;
      return onlyEmpty ? [line] : [...prev, line];
    });
    if (!title.trim()) setTitle(ppmp.itemDescription);
    // Auto-link the APP line for a first single selection.
    const linkedApp = appItems.find((a) => a.ppmpItem.id === ppmp.id);
    if (linkedApp && !appItemId) setAppItemId(linkedApp.id);
  }

  function updateItem(index: number, patch: Partial<CreatePurchaseRequestItemInput>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const itemsRef = useRef<HTMLDivElement>(null);
  const [addedTick, setAddedTick] = useState(0);

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
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

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCost, 0);
  const selectedPpmpIds = [...new Set(items.map((it) => it.ppmpItemId).filter(Boolean))] as string[];
  const linkedAppItems = appItems;

  const ppmpQuery = ppmpSearch.trim().toLowerCase();
  const filteredPpmpItems = ppmpQuery
    ? myPpmpItems.filter(
        (p) =>
          p.code.toLowerCase().includes(ppmpQuery) ||
          p.itemDescription.toLowerCase().includes(ppmpQuery) ||
          p.unitOfMeasure.toLowerCase().includes(ppmpQuery),
      )
    : myPpmpItems;

  const canSubmit =
    title.trim() &&
    items.every(
      (item) =>
        item.description.trim() &&
        item.quantity > 0 &&
        item.estimatedUnitCost > 0 &&
        item.unitOfMeasure.trim(),
    ) &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const pr = await createPurchaseRequest({
        ...(prNumber.trim() ? { prNumber: prNumber.trim() } : {}),
        ...(prDate ? { prDate } : {}),
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(endUserId ? { endUserId } : {}),
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
        ...(selectedPpmpIds.length === 1 ? { ppmpItemId: selectedPpmpIds[0] } : {}),
        ...(appItemId ? { appItemId } : {}),
        ...(selectedFiscalYear ? { fiscalYearId: selectedFiscalYear } : {}),
        // Classification is assigned by the accountant during review — the
        // purchase officer does not set it here.
        items: items.map((item) => ({
          description: item.description.trim(),
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure.trim(),
          estimatedUnitCost: item.estimatedUnitCost,
          ...(item.ppmpItemId ? { ppmpItemId: item.ppmpItemId } : {}),
          ...(item.accountCode?.trim() ? { accountCode: item.accountCode.trim() } : {}),
          ...(item.technicalSpecification?.trim()
            ? { technicalSpecification: item.technicalSpecification.trim() }
            : {}),
        })),
      });
      navigate(`/procurement/purchase-requests/${pr.id}`);
    } catch (err) {
      setError(
        err instanceof ProcurementApiError ? err.message : 'Failed to create purchase request.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pr-page">
      <a
        href="/procurement"
        className="pr-back"
        onClick={(e) => {
          e.preventDefault();
          navigate('/procurement');
        }}
      >
        &larr; Back to Purchase Requests
      </a>
      <h1>New Purchase Request</h1>

      {error && <div className="pr-error">{error}</div>}

      {/* The purchase officer prepares every PR on behalf of the requesting
          end-user; it then routes to the signatories. */}
      <div
        style={{
          background: '#eff8ff',
          border: '1px solid #b2ddff',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 700,
            color: '#175cd3',
            marginBottom: 6,
          }}
        >
          Requesting End-User
        </label>
        <div style={{ maxWidth: 480 }}>
          <EndUserPicker
            endUsers={endUsers}
            value={endUserId}
            departments={departments}
            onChange={setEndUserId}
            onCreated={(created) => {
              setEndUsers((prev) => [...prev, created]);
              setEndUserId(created.id);
            }}
            onUpdated={(updated) => {
              setEndUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            }}
          />
        </div>
        <p style={{ fontSize: 12, color: '#475467', margin: '6px 0 0' }}>
          Pick the end-user to load their PPMP allocations, or add a new one. You (the purchase
          officer) prepare the PR; it then routes to the signatories for review and approval.
        </p>
      </div>

      {/* PPMP Allocations */}
      {!loadingPpmp && myPpmpItems.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)' }}>
              {endUsers.find((u) => u.id === endUserId)?.name ?? 'End-user'}&apos;s PPMP Allocations
            </h3>
            {fiscalYears.length > 1 && (
              <select
                value={selectedFiscalYear}
                onChange={(e) => setSelectedFiscalYear(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1.5px solid #d0d5dd',
                  fontSize: 12,
                }}
              >
                {fiscalYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#667085', marginBottom: 8 }}>
            Check one or more items from the PPMP to add them to this purchase request. Click a
            "Purchased to Date" figure to see the documents behind it.
          </p>
          <input
            type="text"
            value={ppmpSearch}
            onChange={(e) => setPpmpSearch(e.target.value)}
            placeholder="🔍 Search allocations by code, description, or unit…"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '8px 10px',
              border: '1.5px solid #d0d5dd',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              marginBottom: 10,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ overflowX: 'auto' }}>
            <table className="pr-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Allocated Qty</th>
                  <th style={{ textAlign: 'right' }}>Purchased to Date</th>
                  <th style={{ textAlign: 'right' }}>Remaining Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Remaining Budget</th>
                </tr>
              </thead>
              <tbody>
                {filteredPpmpItems.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: '#667085', padding: 16 }}>
                      No allocations match "{ppmpSearch}".
                    </td>
                  </tr>
                )}
                {filteredPpmpItems.map((ppmp) => {
                  const remQty = parseFloat(ppmp.remainingQuantity);
                  const purchased = parseFloat(ppmp.purchasedQuantity ?? '0');
                  const isSelected = items.some((it) => it.ppmpItemId === ppmp.id);
                  const exhausted = remQty <= 0;
                  return (
                    <tr
                      key={ppmp.id}
                      style={{
                        background: isSelected ? '#eff8ff' : exhausted ? '#f9fafb' : undefined,
                        opacity: exhausted && !isSelected ? 0.55 : 1,
                        cursor: exhausted ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => !exhausted && toggleAllocation(ppmp)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={exhausted && !isSelected}
                          onChange={() => toggleAllocation(ppmp)}
                          style={{ cursor: exhausted ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                      <td>
                        <strong>{ppmp.code}</strong>
                      </td>
                      <td>{ppmp.itemDescription}</td>
                      <td>{ppmp.unitOfMeasure}</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(ppmp.quantity).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            setAcqModal({
                              id: ppmp.id,
                              code: ppmp.code,
                              description: ppmp.itemDescription,
                            })
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#175cd3',
                            cursor: 'pointer',
                            fontWeight: 600,
                            textDecoration: 'underline dotted',
                          }}
                          title="View the PO/DV documents behind this"
                        >
                          {purchased.toLocaleString()}
                        </button>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: exhausted ? '#b42318' : '#067647',
                          fontWeight: 600,
                        }}
                      >
                        {remQty.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatPeso(ppmp.estimatedUnitCost)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPeso(ppmp.remainingAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selectedPpmpIds.length > 0 && (
            <div
              style={{
                background: '#eff8ff',
                borderRadius: 8,
                padding: '10px 16px',
                marginTop: 12,
                fontSize: 13,
              }}
            >
              <strong>{selectedPpmpIds.length}</strong> PPMP item
              {selectedPpmpIds.length === 1 ? '' : 's'} added to this request — adjust each line's
              quantity in the Items section below.
            </div>
          )}
        </div>
      )}
      {loadingPpmp && (
        <p style={{ color: '#667085', fontSize: 13 }}>Loading PPMP allocations...</p>
      )}
      {!loadingPpmp && myPpmpItems.length === 0 && (
        <div
          style={{
            background: '#f9fafb',
            borderRadius: 8,
            padding: '16px',
            marginBottom: 24,
            fontSize: 13,
            color: '#667085',
          }}
        >
          {!endUserId
            ? 'Select the requesting end-user above to load their PPMP allocations — or create a PR manually below.'
            : 'No approved PPMP allocations for this end-user in the current fiscal year. You can still create a PR manually below.'}
        </div>
      )}

      <form className="pr-form" onSubmit={handleSubmit}>
        <div className="pr-form-grid">
          <div className="pr-field">
            <label>PR Number (optional)</label>
            <input
              type="text"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
              placeholder="Leave blank to auto-generate (PR-000001)"
              maxLength={30}
            />
          </div>

          <div className="pr-field">
            <label>PR Date (optional)</label>
            <input type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} />
            <span style={{ fontSize: 11, color: '#667085' }}>Leave blank to date it today.</span>
          </div>
        </div>

        <div className="pr-form-grid">
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
            placeholder="e.g. Office Supplies Q3"
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
              placeholder="Additional details..."
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

          <div className="pr-field">
            <label>APP Item (Annual Procurement Plan)</label>
            <select value={appItemId} onChange={(e) => setAppItemId(e.target.value)}>
              <option value="">No APP item linked</option>
              {linkedAppItems.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.appNumber} — {a.procurementProjectTitle} (Budget:{' '}
                  {formatPeso(a.approvedBudget)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="pr-items-header">
            <h3>Items</h3>
            <button type="button" className="pr-btn" onClick={addItem}>
              + Add Item
            </button>
          </div>

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
                    required
                    maxLength={500}
                  />
                </div>
                <div>
                  <label>Qty</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                    min={0.0001}
                    step="any"
                    required
                  />
                </div>
                <div>
                  <label>Unit</label>
                  <input
                    type="text"
                    value={item.unitOfMeasure}
                    onChange={(e) => updateItem(idx, { unitOfMeasure: e.target.value })}
                    required
                    maxLength={20}
                  />
                </div>
                <div>
                  <label>Unit Cost</label>
                  <input
                    type="number"
                    value={item.estimatedUnitCost}
                    onChange={(e) =>
                      updateItem(idx, { estimatedUnitCost: parseFloat(e.target.value) || 0 })
                    }
                    min={0.01}
                    step="0.01"
                    required
                  />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
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
              </div>
              <p style={{ textAlign: 'right', fontSize: 12, color: '#475467', margin: '8px 0 0' }}>
                Line total: {formatPeso((item.quantity * item.estimatedUnitCost).toFixed(2))}
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

        <div className="pr-form-actions">
          <button type="button" className="pr-btn" onClick={() => navigate('/procurement')}>
            Cancel
          </button>
          <button type="submit" className="pr-btn pr-btn--primary" disabled={!canSubmit}>
            {submitting ? 'Creating...' : 'Create Purchase Request'}
          </button>
        </div>
      </form>

      {acqModal && (
        <AcquisitionsModal
          ppmpItemId={acqModal.id}
          itemCode={acqModal.code}
          itemDescription={acqModal.description}
          onClose={() => setAcqModal(null)}
        />
      )}
    </div>
  );
}
