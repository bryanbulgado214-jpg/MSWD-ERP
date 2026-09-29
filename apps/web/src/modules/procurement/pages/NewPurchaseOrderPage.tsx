import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  createPurchaseOrder,
  listPurchaseOrders,
  listPurchaseRequests,
  listSuppliers,
  ProcurementApiError,
} from '../api';
import type { PurchaseRequest, Supplier } from '../types';
import './procurement.css';

// A PO can only be raised against a PR the BAC has taken into procurement.
const ELIGIBLE_PR_STATUSES = ['procurement_in_progress', 'awarded'];

const MODE_OPTIONS = [
  'Public/Competitive Bidding',
  'Small Value Procurement',
  'Shopping',
  'Direct Contracting',
  'Negotiated Procurement',
  'Repeat Order',
  'Agency-to-Agency',
];

export function NewPurchaseOrderPage() {
  const navigate = useNavigate();
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [purchaseRequestId, setPurchaseRequestId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [contractAmount, setContractAmount] = useState('');
  const [awardDate, setAwardDate] = useState('');
  const [awardNoticeNumber, setAwardNoticeNumber] = useState('');
  const [modeOfProcurement, setModeOfProcurement] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPurchaseRequests(), listPurchaseOrders(), listSuppliers()])
      .then(([allPrs, pos, sups]) => {
        if (cancelled) return;
        // Exclude PRs that already have an active (non-cancelled) PO.
        const takenPrIds = new Set(
          pos.filter((po) => po.status !== 'cancelled').map((po) => po.purchaseRequest.id),
        );
        setPrs(
          allPrs.filter(
            (pr) => ELIGIBLE_PR_STATUSES.includes(pr.status) && !takenPrIds.has(pr.id),
          ),
        );
        setSuppliers(sups); // listSuppliers() returns active suppliers by default
      })
      .catch((e) => {
        if (!cancelled)
          setLoadError(
            e instanceof ProcurementApiError ? e.message : 'Failed to load reference data.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPr = useMemo(() => prs.find((p) => p.id === purchaseRequestId), [prs, purchaseRequestId]);

  function onSelectPr(id: string) {
    setPurchaseRequestId(id);
    const pr = prs.find((p) => p.id === id);
    // Default the contract amount to the PR total; the officer can adjust it.
    if (pr && !contractAmount) setContractAmount(String(pr.totalAmount));
  }

  const canSubmit =
    !!purchaseRequestId && !!supplierId && !!poDate && (parseFloat(contractAmount) || 0) > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const po = await createPurchaseOrder({
        purchaseRequestId,
        supplierId,
        poDate,
        contractAmount: parseFloat(contractAmount),
        ...(awardDate ? { awardDate } : {}),
        ...(awardNoticeNumber.trim() ? { awardNoticeNumber: awardNoticeNumber.trim() } : {}),
        ...(modeOfProcurement ? { modeOfProcurement } : {}),
        ...(deliveryTerms.trim() ? { deliveryTerms: deliveryTerms.trim() } : {}),
        ...(paymentTerms.trim() ? { paymentTerms: paymentTerms.trim() } : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      });
      navigate(`/procurement/purchase-orders/${po.id}`);
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Failed to create the purchase order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pr-page">
      <Link to="/procurement/purchase-orders" className="pr-back">
        {'<-'} Back to Purchase Orders
      </Link>
      <h1>New Purchase Order</h1>
      <p style={{ color: '#667085', fontSize: 14, marginBottom: 20, maxWidth: 720 }}>
        A purchase order is awarded against a purchase request that has reached{' '}
        <strong>Procurement In Progress</strong>. Pick the PR and the winning supplier, then confirm
        the contract amount and terms.
      </p>

      {loadError && <div className="pr-error">{loadError}</div>}
      {error && <div className="pr-error">{error}</div>}

      {!loadError && prs.length === 0 && (
        <div
          style={{
            border: '1px dashed #d0d5dd',
            borderRadius: 10,
            padding: 24,
            color: '#667085',
            maxWidth: 720,
          }}
        >
          No purchase requests are ready for a PO yet. A PR must be approved and taken into
          procurement (status <strong>Procurement In Progress</strong>) — and not already have a PO —
          before you can award one here.
        </div>
      )}

      {prs.length > 0 && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div className="pr-field">
              <label>Purchase Request *</label>
              <select value={purchaseRequestId} onChange={(e) => onSelectPr(e.target.value)}>
                <option value="">— Select a PR —</option>
                {prs.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.prNumber} — {pr.title} ({formatPeso(pr.totalAmount)})
                  </option>
                ))}
              </select>
            </div>
            <div className="pr-field">
              <label>Supplier *</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Select a supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {suppliers.length === 0 && (
                <span style={{ fontSize: 11, color: '#b54708' }}>
                  No active suppliers — add one under Suppliers first.
                </span>
              )}
            </div>
          </div>

          {selectedPr && (
            <div style={{ fontSize: 12.5, color: '#475467', marginBottom: 14 }}>
              PR total: <strong>{formatPeso(selectedPr.totalAmount)}</strong>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div className="pr-field">
              <label>PO Date *</label>
              <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </div>
            <div className="pr-field">
              <label>Contract Amount *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={contractAmount}
                onChange={(e) => setContractAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div className="pr-field">
              <label>Award Date</label>
              <input type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} />
            </div>
            <div className="pr-field">
              <label>Notice of Award No.</label>
              <input
                type="text"
                value={awardNoticeNumber}
                onChange={(e) => setAwardNoticeNumber(e.target.value)}
                placeholder="e.g. NOA-2026-001"
              />
            </div>
          </div>

          <div className="pr-field" style={{ marginBottom: 14 }}>
            <label>Mode of Procurement</label>
            <select value={modeOfProcurement} onChange={(e) => setModeOfProcurement(e.target.value)}>
              <option value="">— Select —</option>
              {MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div className="pr-field">
              <label>Delivery Terms</label>
              <input
                type="text"
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                placeholder="e.g. 30 calendar days"
              />
            </div>
            <div className="pr-field">
              <label>Payment Terms</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Upon delivery & inspection"
              />
            </div>
          </div>

          <div className="pr-field" style={{ marginBottom: 20 }}>
            <label>Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="pr-form-actions">
            <Link to="/procurement/purchase-orders" className="pr-btn" style={{ textDecoration: 'none' }}>
              Cancel
            </Link>
            <button
              className="pr-btn pr-btn--primary"
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
            >
              {saving ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
