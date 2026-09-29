import { useEffect, useState } from 'react';
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
  const [selectedPpmpItemId, setSelectedPpmpItemId] = useState('');
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [appItems, setAppItems] = useState<AppItem[]>([]);
  // The purchase officer prepares every PR; the end-user who initiated the
  // request is selected here so their PPMP allocations can be drawn from.
  const [endUsers, setEndUsers] = useState<EndUser[]>([]);
  const [endUserId, setEndUserId] = useState('');

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
    setSelectedPpmpItemId('');
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

  function selectPpmpItem(ppmpItemId: string) {
    setSelectedPpmpItemId(ppmpItemId);
    const ppmp = myPpmpItems.find((p) => p.id === ppmpItemId);
    if (!ppmp) return;
    setTitle(ppmp.itemDescription);
    setItems([
      {
        description: ppmp.itemDescription,
        quantity: parseFloat(ppmp.remainingQuantity),
        unitOfMeasure: ppmp.unitOfMeasure,
        estimatedUnitCost: parseFloat(ppmp.estimatedUnitCost),
      },
    ]);
    const linkedApp = appItems.find((a) => a.ppmpItem.id === ppmpItemId);
    setAppItemId(linkedApp ? linkedApp.id : '');
  }

  function updateItem(index: number, patch: Partial<CreatePurchaseRequestItemInput>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCost, 0);
  const selectedPpmpItem = myPpmpItems.find((p) => p.id === selectedPpmpItemId);
  const linkedAppItems = selectedPpmpItemId
    ? appItems.filter((a) => a.ppmpItem.id === selectedPpmpItemId)
    : appItems;

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
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(endUserId ? { endUserId } : {}),
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
        ...(selectedPpmpItemId ? { ppmpItemId: selectedPpmpItemId } : {}),
        ...(appItemId ? { appItemId } : {}),
        ...(selectedFiscalYear ? { fiscalYearId: selectedFiscalYear } : {}),
        // Classification is assigned by the accountant during review — the
        // purchase officer does not set it here.
        items: items.map((item) => ({
          description: item.description.trim(),
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure.trim(),
          estimatedUnitCost: item.estimatedUnitCost,
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
            Select an item from your PPMP to pre-fill the purchase request.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="pr-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Allocated Qty</th>
                  <th style={{ textAlign: 'right' }}>Remaining Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Remaining Budget</th>
                </tr>
              </thead>
              <tbody>
                {myPpmpItems.map((ppmp) => {
                  const remQty = parseFloat(ppmp.remainingQuantity);
                  const isSelected = selectedPpmpItemId === ppmp.id;
                  const exhausted = remQty <= 0;
                  return (
                    <tr
                      key={ppmp.id}
                      style={{
                        background: isSelected ? '#eff8ff' : exhausted ? '#f9fafb' : undefined,
                        opacity: exhausted ? 0.5 : 1,
                        cursor: exhausted ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => !exhausted && selectPpmpItem(ppmp.id)}
                    >
                      <td>
                        <input
                          type="radio"
                          name="ppmpItem"
                          checked={isSelected}
                          disabled={exhausted}
                          onChange={() => selectPpmpItem(ppmp.id)}
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
          {selectedPpmpItem && (
            <div
              style={{
                background: '#eff8ff',
                borderRadius: 8,
                padding: '12px 16px',
                marginTop: 12,
                fontSize: 13,
              }}
            >
              Selected: <strong>{selectedPpmpItem.code}</strong> —{' '}
              {selectedPpmpItem.itemDescription}
              {' | '}Remaining: {parseFloat(selectedPpmpItem.remainingQuantity).toLocaleString()}{' '}
              {selectedPpmpItem.unitOfMeasure}
              {' | '}Budget: {formatPeso(selectedPpmpItem.remainingAmount)}
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
    </div>
  );
}
