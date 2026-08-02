import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  addWorkOrderMaterial,
  addWorkOrderNote,
  assignWorkOrder,
  cancelWorkOrder,
  completeWorkOrder,
  getEmployeesLookup,
  getInventoryItemsLookup,
  getWorkOrder,
  removeWorkOrderMaterial,
  startWorkOrder,
  verifyWorkOrder,
} from '../api';
import type { WorkOrder } from '../types';
import { WO_PRIORITY_LABELS, WO_STATUS_LABELS, WO_TYPE_LABELS } from '../types';
import type { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '../types';
import '../workorders.css';

interface EmployeeOption { id: string; firstName: string; lastName: string; position?: { title: string } | null }
interface InventoryItemOption { id: string; itemCode: string; description: string; unitOfMeasure: string; unitCost: string; onHandQuantity: string }

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [assignTo, setAssignTo] = useState('');

  const [showComplete, setShowComplete] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [actualHrs, setActualHrs] = useState('');

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Materials state
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [materialQty, setMaterialQty] = useState('');
  const [materialNotes, setMaterialNotes] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [removingMaterialId, setRemovingMaterialId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getWorkOrder(id)
      .then(setWo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    getEmployeesLookup().then(setEmployees).catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (itemSearch.length >= 2) {
        getInventoryItemsLookup(itemSearch).then(setInventoryItems).catch(() => {});
      } else if (itemSearch.length === 0) {
        getInventoryItemsLookup().then(setInventoryItems).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [itemSearch]);

  if (loading) return <p className="wo-loading">Loading...</p>;
  if (error) return <div className="wo-error">{error}</div>;
  if (!wo) return <div className="wo-error">Work order not found</div>;

  const canAssign = permissions.has('workorder.assign');
  const canExecute = permissions.has('workorder.execute');
  const canVerify = permissions.has('workorder.verify');
  const canCreate = permissions.has('workorder.create');
  const canEditWo = canCreate && ['draft', 'pending'].includes(wo.status);
  const canManageMaterials = canExecute && ['assigned', 'in_progress'].includes(wo.status);

  async function doAction(action: () => Promise<WorkOrder>) {
    setActing(true);
    setActionError('');
    try {
      const updated = await action();
      setWo(updated);
      setShowAssign(false);
      setShowComplete(false);
      setShowCancel(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim() || !wo) return;
    setAddingNote(true);
    try {
      await addWorkOrderNote(wo.id, newNote.trim());
      setNewNote('');
      const refreshed = await getWorkOrder(wo.id);
      setWo(refreshed);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  }

  async function handleAddMaterial() {
    if (!wo || !selectedItemId || !materialQty) return;
    setAddingMaterial(true);
    setActionError('');
    try {
      await addWorkOrderMaterial(wo.id, {
        inventoryItemId: selectedItemId,
        quantityUsed: Number(materialQty),
        ...(materialNotes.trim() ? { notes: materialNotes.trim() } : {}),
      });
      setSelectedItemId('');
      setMaterialQty('');
      setMaterialNotes('');
      const refreshed = await getWorkOrder(wo.id);
      setWo(refreshed);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to add material');
    } finally {
      setAddingMaterial(false);
    }
  }

  async function handleRemoveMaterial(materialId: string) {
    if (!wo) return;
    setRemovingMaterialId(materialId);
    setActionError('');
    try {
      await removeWorkOrderMaterial(wo.id, materialId);
      const refreshed = await getWorkOrder(wo.id);
      setWo(refreshed);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove material');
    } finally {
      setRemovingMaterialId(null);
    }
  }

  const selectedItem = inventoryItems.find(i => i.id === selectedItemId);

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <div>
          <button type="button" className="wo-btn wo-btn--sm" onClick={() => navigate('/work-orders')}>
            &larr; Back
          </button>
          <h1 style={{ marginTop: '0.5rem' }}>{wo.woNumber}: {wo.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canEditWo && (
            <button type="button" className="wo-btn wo-btn--sm" onClick={() => navigate(`/work-orders/${wo.id}/edit`)}>
              Edit
            </button>
          )}
          <button type="button" className="wo-btn wo-btn--sm" onClick={() => navigate(`/work-orders/${wo.id}/print`)}>
            Print
          </button>
        </div>
      </div>

      {actionError && <div className="wo-error">{actionError}</div>}

      <div className="wo-detail">
        <div className="wo-detail__main">
          <section className="wo-card">
            <h2 className="wo-card__title">Details</h2>
            <div className="wo-detail__grid">
              <div className="wo-detail__field">
                <span className="wo-detail__label">Type</span>
                <span className={`wo-badge wo-badge--type-${wo.type}`}>
                  {WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}
                </span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Priority</span>
                <span className={`wo-badge wo-badge--priority-${wo.priority}`}>
                  {WO_PRIORITY_LABELS[wo.priority as WorkOrderPriority] ?? wo.priority}
                </span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Status</span>
                <span className={`wo-badge wo-badge--status-${wo.status}`}>
                  {WO_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status}
                </span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Scheduled</span>
                <span>{wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Location</span>
                <span>{wo.location ?? '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Est. Duration</span>
                <span>{wo.estimatedDurationHrs ? `${Number(wo.estimatedDurationHrs)} hrs` : '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Actual Duration</span>
                <span>{wo.actualDurationHrs ? `${Number(wo.actualDurationHrs)} hrs` : '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Materials Cost</span>
                <span>{Number(wo.materialsCost).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</span>
              </div>
            </div>
            {wo.description && (
              <div style={{ marginTop: '1rem' }}>
                <span className="wo-detail__label">Description</span>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.25rem' }}>{wo.description}</p>
              </div>
            )}
            {wo.completionNotes && (
              <div style={{ marginTop: '1rem' }}>
                <span className="wo-detail__label">Completion Notes</span>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.25rem' }}>{wo.completionNotes}</p>
              </div>
            )}
          </section>

          <section className="wo-card">
            <h2 className="wo-card__title">Consumer & Meter</h2>
            <div className="wo-detail__grid">
              <div className="wo-detail__field">
                <span className="wo-detail__label">Consumer</span>
                <span>
                  {wo.consumer
                    ? `${wo.consumer.accountNumber} — ${wo.consumer.firstName} ${wo.consumer.lastName}`
                    : '—'}
                </span>
              </div>
              {wo.consumer?.address && (
                <div className="wo-detail__field">
                  <span className="wo-detail__label">Consumer Address</span>
                  <span>{wo.consumer.address}</span>
                </div>
              )}
              <div className="wo-detail__field">
                <span className="wo-detail__label">Meter</span>
                <span>
                  {wo.meter
                    ? `${wo.meter.serialNumber}${wo.meter.brand ? ` (${wo.meter.brand})` : ''}`
                    : '—'}
                </span>
              </div>
            </div>
          </section>

          <section className="wo-card">
            <h2 className="wo-card__title">Assignment & Verification</h2>
            <div className="wo-detail__grid">
              <div className="wo-detail__field">
                <span className="wo-detail__label">Assigned To</span>
                <span>
                  {wo.assignee
                    ? `${wo.assignee.firstName} ${wo.assignee.lastName}${wo.assignee.position?.title ? ` — ${wo.assignee.position?.title}` : ''}`
                    : '—'}
                </span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Assigned At</span>
                <span>{wo.assignedAt ? new Date(wo.assignedAt).toLocaleString() : '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Started At</span>
                <span>{wo.startedAt ? new Date(wo.startedAt).toLocaleString() : '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Completed At</span>
                <span>{wo.completedAt ? new Date(wo.completedAt).toLocaleString() : '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Verified By</span>
                <span>{wo.verifier?.username ?? '—'}</span>
              </div>
              <div className="wo-detail__field">
                <span className="wo-detail__label">Verified At</span>
                <span>{wo.verifiedAt ? new Date(wo.verifiedAt).toLocaleString() : '—'}</span>
              </div>
            </div>
          </section>

          <section className="wo-card">
            <h2 className="wo-card__title">Materials Used</h2>
            {wo.materials && wo.materials.length > 0 ? (
              <div className="wo-table-wrap">
                <table className="wo-table wo-table--compact">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit Cost</th>
                      <th>Total</th>
                      <th>Notes</th>
                      {canManageMaterials && <th style={{ width: '70px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.materials.map((m) => (
                      <tr key={m.id}>
                        <td>{m.inventoryItem ? `${m.inventoryItem.itemCode} — ${m.inventoryItem.description}` : m.inventoryItemId}</td>
                        <td>{Number(m.quantityUsed)} {m.inventoryItem?.unitOfMeasure ?? ''}</td>
                        <td>{Number(m.unitCost).toFixed(2)}</td>
                        <td>{Number(m.totalCost).toFixed(2)}</td>
                        <td>{m.notes ?? '—'}</td>
                        {canManageMaterials && (
                          <td>
                            <button
                              type="button"
                              className="wo-btn wo-btn--danger wo-btn--sm"
                              disabled={removingMaterialId === m.id}
                              onClick={() => handleRemoveMaterial(m.id)}
                            >
                              {removingMaterialId === m.id ? '...' : 'Remove'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="wo-empty" style={{ padding: '0.5rem 0' }}>No materials recorded yet.</p>
            )}

            {canManageMaterials && (
              <div className="wo-material-add">
                <h3 className="wo-material-add__title">Add Material</h3>
                <div className="wo-material-add__grid">
                  <div className="wo-form__field">
                    <span className="wo-form__label">Search Items</span>
                    <input
                      className="wo-input"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Search by code or name..."
                    />
                  </div>
                  <div className="wo-form__field">
                    <span className="wo-form__label">Select Item</span>
                    <select className="wo-select" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
                      <option value="">— Select —</option>
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.itemCode} — {item.description} (On hand: {Number(item.onHandQuantity)} {item.unitOfMeasure})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="wo-form__field">
                    <span className="wo-form__label">Quantity</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="wo-input"
                      value={materialQty}
                      onChange={(e) => setMaterialQty(e.target.value)}
                      placeholder={selectedItem ? selectedItem.unitOfMeasure : 'Qty'}
                    />
                  </div>
                  <div className="wo-form__field">
                    <span className="wo-form__label">Notes</span>
                    <input
                      className="wo-input"
                      value={materialNotes}
                      onChange={(e) => setMaterialNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {selectedItem && (
                  <p className="wo-material-add__cost">
                    Unit cost: {Number(selectedItem.unitCost).toFixed(2)} &times; {materialQty || '0'} = <strong>{(Number(selectedItem.unitCost) * (Number(materialQty) || 0)).toFixed(2)}</strong>
                  </p>
                )}
                <button
                  type="button"
                  className="wo-btn wo-btn--primary wo-btn--sm"
                  disabled={addingMaterial || !selectedItemId || !materialQty}
                  onClick={handleAddMaterial}
                >
                  {addingMaterial ? 'Adding...' : 'Add Material'}
                </button>
              </div>
            )}
          </section>

          <section className="wo-card">
            <h2 className="wo-card__title">Notes</h2>
            {wo.notes && wo.notes.length > 0 ? (
              <div className="wo-notes">
                {wo.notes.map((n) => (
                  <div key={n.id} className="wo-note">
                    <div className="wo-note__header">
                      <strong>{n.author?.username ?? 'System'}</strong>
                      <span className="wo-note__date">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="wo-note__text">{n.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wo-empty">No notes yet.</p>
            )}
            <div className="wo-note__add">
              <textarea
                className="wo-textarea"
                rows={2}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
              />
              <button
                type="button"
                className="wo-btn wo-btn--primary wo-btn--sm"
                onClick={handleAddNote}
                disabled={addingNote || !newNote.trim()}
              >
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </div>
          </section>
        </div>

        <div className="wo-detail__sidebar">
          <section className="wo-card">
            <h2 className="wo-card__title">Actions</h2>
            <div className="wo-actions">
              {canAssign && ['pending', 'assigned'].includes(wo.status) && (
                <>
                  <button
                    type="button"
                    className="wo-btn wo-btn--primary"
                    onClick={() => setShowAssign(!showAssign)}
                  >
                    {wo.status === 'assigned' ? 'Reassign' : 'Assign'}
                  </button>
                  {showAssign && (
                    <div className="wo-assign-form">
                      <select
                        className="wo-select"
                        value={assignTo}
                        onChange={(e) => setAssignTo(e.target.value)}
                      >
                        <option value="">Select employee...</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.firstName} {emp.lastName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="wo-btn wo-btn--primary wo-btn--sm"
                        disabled={acting || !assignTo}
                        onClick={() => doAction(() => assignWorkOrder(wo.id, { expectedVersion: wo.version, assignedTo: assignTo }))}
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </>
              )}

              {canExecute && wo.status === 'assigned' && (
                <button
                  type="button"
                  className="wo-btn wo-btn--success"
                  disabled={acting}
                  onClick={() => doAction(() => startWorkOrder(wo.id, { expectedVersion: wo.version }))}
                >
                  Start Work
                </button>
              )}

              {canExecute && wo.status === 'in_progress' && (
                <>
                  <button
                    type="button"
                    className="wo-btn wo-btn--success"
                    onClick={() => setShowComplete(!showComplete)}
                  >
                    Complete Work
                  </button>
                  {showComplete && (
                    <div className="wo-complete-form">
                      <textarea
                        className="wo-textarea"
                        rows={2}
                        value={completionNotes}
                        onChange={(e) => setCompletionNotes(e.target.value)}
                        placeholder="Completion notes..."
                      />
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="wo-input"
                        value={actualHrs}
                        onChange={(e) => setActualHrs(e.target.value)}
                        placeholder="Actual hours"
                      />
                      <button
                        type="button"
                        className="wo-btn wo-btn--success wo-btn--sm"
                        disabled={acting}
                        onClick={() =>
                          doAction(() =>
                            completeWorkOrder(wo.id, {
                              expectedVersion: wo.version,
                              ...(completionNotes ? { completionNotes } : {}),
                              ...(actualHrs ? { actualDurationHrs: Number(actualHrs) } : {}),
                            }),
                          )
                        }
                      >
                        Confirm Completion
                      </button>
                    </div>
                  )}
                </>
              )}

              {canVerify && wo.status === 'completed' && (
                <button
                  type="button"
                  className="wo-btn wo-btn--success"
                  disabled={acting}
                  onClick={() => doAction(() => verifyWorkOrder(wo.id, { expectedVersion: wo.version }))}
                >
                  Verify Work
                </button>
              )}

              {canCreate && !['verified', 'cancelled'].includes(wo.status) && (
                <>
                  <button
                    type="button"
                    className="wo-btn wo-btn--danger"
                    onClick={() => setShowCancel(!showCancel)}
                  >
                    Cancel Work Order
                  </button>
                  {showCancel && (
                    <div className="wo-cancel-form">
                      <textarea
                        className="wo-textarea"
                        rows={2}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Reason for cancellation..."
                      />
                      <button
                        type="button"
                        className="wo-btn wo-btn--danger wo-btn--sm"
                        disabled={acting || !cancelReason.trim()}
                        onClick={() =>
                          doAction(() =>
                            cancelWorkOrder(wo.id, {
                              expectedVersion: wo.version,
                              ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
                            }),
                          )
                        }
                      >
                        {acting ? 'Cancelling...' : 'Confirm Cancel'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {['verified', 'cancelled'].includes(wo.status) && (
                <p className="wo-empty">No actions available.</p>
              )}
            </div>
          </section>

          <section className="wo-card">
            <h2 className="wo-card__title">Metadata</h2>
            <div className="wo-meta">
              <div>
                <span className="wo-detail__label">Created</span>
                <span>{new Date(wo.createdAt).toLocaleString()}</span>
                {wo.creator && <span className="wo-meta__by">by {wo.creator.username}</span>}
              </div>
              <div>
                <span className="wo-detail__label">Last Updated</span>
                <span>{new Date(wo.updatedAt).toLocaleString()}</span>
                {wo.updater && <span className="wo-meta__by">by {wo.updater.username}</span>}
              </div>
              <div>
                <span className="wo-detail__label">Version</span>
                <span>{wo.version}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
