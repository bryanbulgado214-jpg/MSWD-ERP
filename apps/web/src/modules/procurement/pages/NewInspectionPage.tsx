import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createInspection, listPurchaseOrders, ProcurementApiError } from '../api';
import type { PurchaseOrder } from '../types';
import './procurement.css';

interface ItemRow {
  description: string;
  unitOfMeasure: string;
  quantityOrdered: string;
  quantityDelivered: string;
  quantityAccepted: string;
  quantityRejected: string;
  result: string;
  remarks: string;
}

function emptyRow(): ItemRow {
  return {
    description: '',
    unitOfMeasure: '',
    quantityOrdered: '0',
    quantityDelivered: '0',
    quantityAccepted: '0',
    quantityRejected: '0',
    result: 'pending',
    remarks: '',
  };
}

export function NewInspectionPage() {
  const navigate = useNavigate();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryNote, setDeliveryNote] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [findings, setFindings] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listPurchaseOrders()
      .then(setPos)
      .catch(() => {});
  }, []);

  const selectedPo = pos.find((p) => p.id === selectedPoId);

  function handlePoChange(poId: string) {
    setSelectedPoId(poId);
    const po = pos.find((p) => p.id === poId);
    if (!po) return;

    const prItems = (
      po as PurchaseOrder & {
        purchaseRequest?: {
          items?: Array<{ description: string; unitOfMeasure: string; quantity: string }>;
        };
      }
    ).purchaseRequest?.items;
    if (prItems && prItems.length > 0) {
      setItems(
        prItems.map((item) => ({
          description: item.description,
          unitOfMeasure: item.unitOfMeasure,
          quantityOrdered: item.quantity,
          quantityDelivered: item.quantity,
          quantityAccepted: item.quantity,
          quantityRejected: '0',
          result: 'accepted',
          remarks: '',
        })),
      );
    }
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPoId) {
      setError('Select a Purchase Order.');
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      setError('All items must have a description.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const report = await createInspection({
        purchaseOrderId: selectedPoId,
        deliveryDate,
        ...(deliveryNote ? { deliveryNote } : {}),
        ...(invoiceNumber ? { invoiceNumber } : {}),
        ...(invoiceDate ? { invoiceDate } : {}),
        ...(findings ? { findings } : {}),
        ...(recommendations ? { recommendations } : {}),
        items: items.map((item) => ({
          description: item.description,
          ...(item.unitOfMeasure ? { unitOfMeasure: item.unitOfMeasure } : {}),
          quantityOrdered: parseFloat(item.quantityOrdered) || 0,
          quantityDelivered: parseFloat(item.quantityDelivered) || 0,
          quantityAccepted: parseFloat(item.quantityAccepted) || 0,
          quantityRejected: parseFloat(item.quantityRejected) || 0,
          result: item.result,
          ...(item.remarks ? { remarks: item.remarks } : {}),
        })),
      });
      navigate(`/procurement/inspections/${report.id}`);
    } catch (e) {
      setError(
        e instanceof ProcurementApiError ? e.message : 'Failed to create inspection report.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pr-page">
      <h1>New Inspection Report</h1>
      {error && <div className="pr-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="pr-form-field">
            <label>Purchase Order *</label>
            <select
              value={selectedPoId}
              onChange={(e) => handlePoChange(e.target.value)}
              required
              style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
            >
              <option value="">Select a PO...</option>
              {pos.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="pr-form-field">
            <label>Delivery Date *</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />
          </div>
          <div className="pr-form-field">
            <label>Delivery Note / DR No.</label>
            <input
              type="text"
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="pr-form-field">
            <label>Invoice Number</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              maxLength={50}
            />
          </div>
          <div className="pr-form-field">
            <label>Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        {selectedPo && (
          <div
            style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <strong>PO: {selectedPo.poNumber}</strong> — PR: {selectedPo.purchaseRequest.prNumber} —{' '}
            {selectedPo.purchaseRequest.title}
          </div>
        )}

        {/* Items */}
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 8px' }}>Inspection Items</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="pr-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Ordered</th>
                <th>Delivered</th>
                <th>Accepted</th>
                <th>Rejected</th>
                <th>Result</th>
                <th>Remarks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      style={{
                        width: '100%',
                        minWidth: 150,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.unitOfMeasure}
                      onChange={(e) => updateItem(idx, 'unitOfMeasure', e.target.value)}
                      style={{
                        width: 60,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.quantityOrdered}
                      onChange={(e) => updateItem(idx, 'quantityOrdered', e.target.value)}
                      style={{
                        width: 70,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.quantityDelivered}
                      onChange={(e) => updateItem(idx, 'quantityDelivered', e.target.value)}
                      style={{
                        width: 70,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.quantityAccepted}
                      onChange={(e) => updateItem(idx, 'quantityAccepted', e.target.value)}
                      style={{
                        width: 70,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.quantityRejected}
                      onChange={(e) => updateItem(idx, 'quantityRejected', e.target.value)}
                      style={{
                        width: 70,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={item.result}
                      onChange={(e) => updateItem(idx, 'result', e.target.value)}
                      style={{
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                      <option value="partial">Partial</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.remarks}
                      onChange={(e) => updateItem(idx, 'remarks', e.target.value)}
                      style={{
                        width: 100,
                        padding: '4px 6px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          fontSize: 16,
                        }}
                      >
                        x
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addItem} className="pr-btn" style={{ marginTop: 8 }}>
          + Add Item
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="pr-form-field">
            <label>Findings</label>
            <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} />
          </div>
          <div className="pr-form-field">
            <label>Recommendations</label>
            <textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button type="submit" className="pr-btn pr-btn--primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Inspection Report'}
          </button>
          <button
            type="button"
            className="pr-btn"
            onClick={() => navigate('/procurement/inspections')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
