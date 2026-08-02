import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getWorkOrder } from '../api';
import type { WorkOrder } from '../types';
import { WO_PRIORITY_LABELS, WO_STATUS_LABELS, WO_TYPE_LABELS } from '../types';
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../types';

export default function WorkOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getWorkOrder(id)
      .then(setWo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;
  if (!wo) return <p>Not found</p>;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .wo-print, .wo-print * { visibility: visible; }
          .wo-print { position: absolute; left: 0; top: 0; width: 100%; }
          .wo-print-actions { display: none !important; }
        }
        .wo-print {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #000;
        }
        .wo-print__header {
          text-align: center;
          border-bottom: 2px solid #000;
          padding-bottom: 0.75rem;
          margin-bottom: 1rem;
        }
        .wo-print__header h1 { font-size: 18px; margin: 0; }
        .wo-print__header h2 { font-size: 14px; margin: 0.25rem 0 0; font-weight: normal; }
        .wo-print__header p { margin: 0.25rem 0 0; font-size: 11px; color: #555; }
        .wo-print__meta {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: #f5f5f5;
        }
        .wo-print__meta-item { display: flex; flex-direction: column; }
        .wo-print__meta-item span:first-child { font-weight: bold; font-size: 10px; text-transform: uppercase; color: #666; }
        .wo-print__meta-item span:last-child { font-size: 13px; }
        .wo-print__section { margin-bottom: 1rem; }
        .wo-print__section h3 {
          font-size: 12px;
          text-transform: uppercase;
          border-bottom: 1px solid #ccc;
          padding-bottom: 0.25rem;
          margin: 0 0 0.5rem;
        }
        .wo-print__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.35rem 1.5rem;
        }
        .wo-print__field { display: flex; gap: 0.35rem; }
        .wo-print__field-label { font-weight: bold; white-space: nowrap; }
        .wo-print table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .wo-print table th,
        .wo-print table td {
          border: 1px solid #ccc;
          padding: 4px 6px;
          text-align: left;
        }
        .wo-print table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        .wo-print__desc {
          white-space: pre-wrap;
          border: 1px solid #ccc;
          padding: 0.5rem;
          min-height: 3rem;
        }
        .wo-print__signatures {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 2rem;
          margin-top: 2.5rem;
          padding-top: 0.5rem;
        }
        .wo-print__sig-block {
          text-align: center;
          padding-top: 2.5rem;
          border-top: 1px solid #000;
        }
        .wo-print__sig-block span { display: block; font-size: 10px; color: #666; }
        .wo-print-actions {
          text-align: center;
          padding: 1rem;
        }
        .wo-print-actions button {
          padding: 0.5rem 2rem;
          font-size: 14px;
          cursor: pointer;
          margin: 0 0.5rem;
        }
      `}</style>
      <div className="wo-print">
        <div className="wo-print-actions">
          <button onClick={() => window.print()}>Print</button>
          <button onClick={() => window.history.back()}>Back</button>
        </div>

        <div className="wo-print__header">
          <h1>METRO SIQUIJOR WATER DISTRICT</h1>
          <h2>WORK ORDER</h2>
          <p>{wo.woNumber}</p>
        </div>

        <div className="wo-print__meta">
          <div className="wo-print__meta-item">
            <span>Type</span>
            <span>{WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}</span>
          </div>
          <div className="wo-print__meta-item">
            <span>Priority</span>
            <span>{WO_PRIORITY_LABELS[wo.priority as WorkOrderPriority] ?? wo.priority}</span>
          </div>
          <div className="wo-print__meta-item">
            <span>Status</span>
            <span>{WO_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status}</span>
          </div>
          <div className="wo-print__meta-item">
            <span>Date</span>
            <span>{new Date(wo.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="wo-print__section">
          <h3>Work Details</h3>
          <div className="wo-print__grid">
            <div className="wo-print__field">
              <span className="wo-print__field-label">Title:</span>
              <span>{wo.title}</span>
            </div>
            <div className="wo-print__field">
              <span className="wo-print__field-label">Location:</span>
              <span>{wo.location ?? '—'}</span>
            </div>
            <div className="wo-print__field">
              <span className="wo-print__field-label">Scheduled:</span>
              <span>{wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString() : '—'}</span>
            </div>
            <div className="wo-print__field">
              <span className="wo-print__field-label">Est. Hours:</span>
              <span>{wo.estimatedDurationHrs ? Number(wo.estimatedDurationHrs) : '—'}</span>
            </div>
          </div>
          {wo.description && (
            <div style={{ marginTop: '0.5rem' }}>
              <span className="wo-print__field-label">Description:</span>
              <div className="wo-print__desc">{wo.description}</div>
            </div>
          )}
        </div>

        <div className="wo-print__section">
          <h3>Consumer & Meter</h3>
          <div className="wo-print__grid">
            <div className="wo-print__field">
              <span className="wo-print__field-label">Consumer:</span>
              <span>
                {wo.consumer
                  ? `${wo.consumer.accountNumber} — ${wo.consumer.firstName} ${wo.consumer.lastName}`
                  : '—'}
              </span>
            </div>
            <div className="wo-print__field">
              <span className="wo-print__field-label">Address:</span>
              <span>{wo.consumer?.address ?? '—'}</span>
            </div>
            <div className="wo-print__field">
              <span className="wo-print__field-label">Meter:</span>
              <span>
                {wo.meter
                  ? `${wo.meter.serialNumber}${wo.meter.brand ? ` (${wo.meter.brand})` : ''}`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="wo-print__section">
          <h3>Assignment</h3>
          <div className="wo-print__grid">
            <div className="wo-print__field">
              <span className="wo-print__field-label">Assigned To:</span>
              <span>
                {wo.assignee
                  ? `${wo.assignee.firstName} ${wo.assignee.lastName}${wo.assignee.position?.title ? ` — ${wo.assignee.position.title}` : ''}`
                  : '—'}
              </span>
            </div>
            <div className="wo-print__field">
              <span className="wo-print__field-label">Assigned Date:</span>
              <span>{wo.assignedAt ? new Date(wo.assignedAt).toLocaleDateString() : '—'}</span>
            </div>
          </div>
        </div>

        {wo.materials && wo.materials.length > 0 && (
          <div className="wo-print__section">
            <h3>Materials</h3>
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {wo.materials.map((m) => (
                  <tr key={m.id}>
                    <td>{m.inventoryItem?.itemCode ?? '—'}</td>
                    <td>{m.inventoryItem?.description ?? m.inventoryItemId}</td>
                    <td>{Number(m.quantityUsed)}</td>
                    <td>{m.inventoryItem?.unitOfMeasure ?? ''}</td>
                    <td style={{ textAlign: 'right' }}>{Number(m.unitCost).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(m.totalCost).toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Materials Cost:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {Number(wo.materialsCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {wo.completionNotes && (
          <div className="wo-print__section">
            <h3>Completion Notes</h3>
            <div className="wo-print__desc">{wo.completionNotes}</div>
          </div>
        )}

        {wo.notes && wo.notes.length > 0 && (
          <div className="wo-print__section">
            <h3>Notes</h3>
            <table>
              <thead>
                <tr><th>Date</th><th>By</th><th>Note</th></tr>
              </thead>
              <tbody>
                {wo.notes.map((n) => (
                  <tr key={n.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(n.createdAt).toLocaleDateString()}</td>
                    <td>{n.author?.username ?? 'System'}</td>
                    <td>{n.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="wo-print__signatures">
          <div className="wo-print__sig-block">
            <span>Prepared By</span>
          </div>
          <div className="wo-print__sig-block">
            <span>Performed By</span>
          </div>
          <div className="wo-print__sig-block">
            <span>Verified By</span>
          </div>
        </div>
      </div>
    </>
  );
}
