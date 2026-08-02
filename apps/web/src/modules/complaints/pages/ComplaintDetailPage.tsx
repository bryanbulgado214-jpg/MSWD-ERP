import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  addComplaintNote,
  assignComplaint,
  closeComplaint,
  getComplaint,
  getEmployeesLookup,
  reopenComplaint,
  resolveComplaint,
  startComplaint,
} from '../api';
import type {
  Complaint,
  ComplaintPriority,
  ComplaintResolutionType,
  ComplaintStatus,
  ComplaintType,
} from '../types';
import {
  COMPLAINT_PRIORITY_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_TYPE_LABELS,
  RESOLUTION_TYPE_LABELS,
} from '../types';
import '../complaints.css';

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  position?: { title: string } | null;
}

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { permissions } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  // Assign form
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assignTo, setAssignTo] = useState('');

  // Resolve form
  const [resolutionType, setResolutionType] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Reopen form
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Notes
  const [newNote, setNewNote] = useState('');
  const [noteInternal, setNoteInternal] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getComplaint(id)
      .then(setComplaint)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    getEmployeesLookup().then(setEmployees).catch(() => {});
  }, []);

  if (loading) return <p className="cs-loading">Loading...</p>;
  if (error) return <div className="cs-error">{error}</div>;
  if (!complaint) return <div className="cs-error">Complaint not found</div>;

  const canAssign = permissions.has('complaint.assign');
  const canResolve = permissions.has('complaint.resolve');
  const canClose = permissions.has('complaint.close');

  async function doAction(action: () => Promise<Complaint>) {
    setActing(true);
    setActionError('');
    try {
      const updated = await action();
      setComplaint(updated);
      setAssignTo('');
      setResolutionType('');
      setResolutionNotes('');
      setShowReopen(false);
      setReopenReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim() || !complaint) return;
    setAddingNote(true);
    setActionError('');
    try {
      await addComplaintNote(complaint.id, newNote.trim(), noteInternal);
      setNewNote('');
      setNoteInternal(false);
      const refreshed = await getComplaint(complaint.id);
      setComplaint(refreshed);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  }

  const status = complaint.status as ComplaintStatus;

  return (
    <div className="cs-page">
      <div className="cs-page__header">
        <div>
          <Link to="/complaints" className="cs-btn cs-btn--sm">&larr; Back</Link>
          <h1 style={{ marginTop: '0.5rem' }}>
            {complaint.complaintNumber}: {complaint.subject}
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span className={`cs-badge cs-badge--type-${complaint.type}`}>
              {COMPLAINT_TYPE_LABELS[complaint.type as ComplaintType] ?? complaint.type}
            </span>
            <span className={`cs-badge cs-badge--priority-${complaint.priority}`}>
              {COMPLAINT_PRIORITY_LABELS[complaint.priority as ComplaintPriority] ?? complaint.priority}
            </span>
            <span className={`cs-badge cs-badge--status-${complaint.status}`}>
              {COMPLAINT_STATUS_LABELS[status] ?? complaint.status}
            </span>
          </div>
        </div>
      </div>

      {actionError && <div className="cs-error">{actionError}</div>}

      <div className="cs-detail">
        <div className="cs-detail__main">
          {/* Details card */}
          <section className="cs-card">
            <h2 className="cs-card__title">Details</h2>
            <div className="cs-detail__grid">
              <div className="cs-detail__field" style={{ gridColumn: '1 / -1' }}>
                <span className="cs-detail__label">Description</span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{complaint.description}</span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">Location</span>
                <span>{complaint.location ?? '—'}</span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">Contact Name</span>
                <span>{complaint.contactName ?? '—'}</span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">Contact Phone</span>
                <span>{complaint.contactPhone ?? '—'}</span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">Contact Email</span>
                <span>{complaint.contactEmail ?? '—'}</span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">Consumer</span>
                <span>
                  {complaint.consumer ? (
                    <Link to={`/billing/consumers/${complaint.consumer.id}`} className="cs-link">
                      {complaint.consumer.accountNumber} — {complaint.consumer.firstName} {complaint.consumer.lastName}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">Created</span>
                <span>{new Date(complaint.createdAt).toLocaleString()}</span>
              </div>
              <div className="cs-detail__field">
                <span className="cs-detail__label">SLA Due</span>
                <span>{complaint.slaDueAt ? new Date(complaint.slaDueAt).toLocaleString() : '—'}</span>
              </div>
            </div>
          </section>

          {/* Linked Work Order card */}
          {complaint.workOrder && (
            <section className="cs-card">
              <h2 className="cs-card__title">Linked Work Order</h2>
              <div className="cs-detail__grid">
                <div className="cs-detail__field">
                  <span className="cs-detail__label">WO #</span>
                  <Link to={`/work-orders/${complaint.workOrder.id}`} className="cs-link">
                    {complaint.workOrder.woNumber}
                  </Link>
                </div>
                <div className="cs-detail__field">
                  <span className="cs-detail__label">Title</span>
                  <span>{complaint.workOrder.title}</span>
                </div>
                <div className="cs-detail__field">
                  <span className="cs-detail__label">Status</span>
                  <span className={`cs-badge cs-badge--status-${complaint.workOrder.status}`}>
                    {complaint.workOrder.status}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Notes card */}
          <section className="cs-card">
            <h2 className="cs-card__title">Notes</h2>
            {complaint.notes && complaint.notes.length > 0 ? (
              <div className="cs-notes">
                {complaint.notes.map((n) => (
                  <div key={n.id} className={`cs-note${n.isInternal ? ' cs-note--internal' : ''}`}>
                    <div className="cs-note__header">
                      <strong>
                        {n.author?.username ?? 'System'}
                        {n.isInternal && <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: '0.5rem', color: '#d97706' }}>(Internal)</span>}
                      </strong>
                      <span className="cs-note__date">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="cs-note__text">{n.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="cs-empty">No notes yet.</p>
            )}
            <div className="cs-note__add">
              <textarea
                className="cs-textarea"
                rows={2}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
              />
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={noteInternal}
                    onChange={(e) => setNoteInternal(e.target.checked)}
                  />
                  Internal
                </label>
                <button
                  type="button"
                  className="cs-btn cs-btn--primary cs-btn--sm"
                  onClick={handleAddNote}
                  disabled={addingNote || !newNote.trim()}
                >
                  {addingNote ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="cs-detail__sidebar">
          {/* Actions card */}
          <section className="cs-card">
            <h2 className="cs-card__title">Actions</h2>
            <div className="cs-actions">
              {/* Assign - available when open or reopened */}
              {canAssign && ['open', 'reopened'].includes(status) && (
                <div className="cs-assign-form">
                  <select
                    className="cs-select"
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
                    className="cs-btn cs-btn--primary cs-btn--sm"
                    disabled={acting || !assignTo}
                    onClick={() =>
                      doAction(() =>
                        assignComplaint(complaint.id, {
                          expectedVersion: complaint.version,
                          assignedTo: assignTo,
                        }),
                      )
                    }
                  >
                    {acting ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              )}

              {/* Assigned: start progress + reassign */}
              {canAssign && status === 'assigned' && (
                <>
                  <button
                    type="button"
                    className="cs-btn cs-btn--success"
                    disabled={acting}
                    onClick={() =>
                      doAction(() =>
                        startComplaint(complaint.id, {
                          expectedVersion: complaint.version,
                        }),
                      )
                    }
                  >
                    {acting ? 'Starting...' : 'Start Progress'}
                  </button>
                  <div className="cs-assign-form">
                    <select
                      className="cs-select"
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                    >
                      <option value="">Reassign to...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="cs-btn cs-btn--primary cs-btn--sm"
                      disabled={acting || !assignTo}
                      onClick={() =>
                        doAction(() =>
                          assignComplaint(complaint.id, {
                            expectedVersion: complaint.version,
                            assignedTo: assignTo,
                          }),
                        )
                      }
                    >
                      {acting ? 'Reassigning...' : 'Reassign'}
                    </button>
                  </div>
                </>
              )}

              {/* Resolve - available when assigned or in_progress */}
              {canResolve && ['assigned', 'in_progress'].includes(status) && (
                <div className="cs-resolve-form">
                  <select
                    className="cs-select"
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value)}
                  >
                    <option value="">Resolution type...</option>
                    {(Object.entries(RESOLUTION_TYPE_LABELS) as [ComplaintResolutionType, string][]).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <textarea
                    className="cs-textarea"
                    rows={2}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Resolution notes..."
                  />
                  <button
                    type="button"
                    className="cs-btn cs-btn--success cs-btn--sm"
                    disabled={acting || !resolutionType}
                    onClick={() =>
                      doAction(() =>
                        resolveComplaint(complaint.id, {
                          expectedVersion: complaint.version,
                          resolutionType,
                          ...(resolutionNotes.trim() ? { resolutionNotes: resolutionNotes.trim() } : {}),
                        }),
                      )
                    }
                  >
                    {acting ? 'Resolving...' : 'Resolve'}
                  </button>
                </div>
              )}

              {/* Close - available when resolved */}
              {canClose && status === 'resolved' && (
                <button
                  type="button"
                  className="cs-btn cs-btn--primary"
                  disabled={acting}
                  onClick={() =>
                    doAction(() =>
                      closeComplaint(complaint.id, {
                        expectedVersion: complaint.version,
                      }),
                    )
                  }
                >
                  {acting ? 'Closing...' : 'Close Complaint'}
                </button>
              )}

              {/* Reopen - available when resolved or closed */}
              {canResolve && ['resolved', 'closed'].includes(status) && (
                <>
                  <button
                    type="button"
                    className="cs-btn cs-btn--danger"
                    onClick={() => setShowReopen(!showReopen)}
                  >
                    Reopen
                  </button>
                  {showReopen && (
                    <div className="cs-reopen-form">
                      <textarea
                        className="cs-textarea"
                        rows={2}
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                        placeholder="Reason for reopening..."
                      />
                      <button
                        type="button"
                        className="cs-btn cs-btn--danger cs-btn--sm"
                        disabled={acting}
                        onClick={() =>
                          doAction(() =>
                            reopenComplaint(complaint.id, {
                              expectedVersion: complaint.version,
                              ...(reopenReason.trim() ? { reason: reopenReason.trim() } : {}),
                            }),
                          )
                        }
                      >
                        {acting ? 'Reopening...' : 'Confirm Reopen'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* No actions state */}
              {status === 'closed' && !canResolve && (
                <p className="cs-empty">No actions available.</p>
              )}
            </div>
          </section>

          {/* Resolution card */}
          {complaint.resolvedAt && (
            <section className="cs-card">
              <h2 className="cs-card__title">Resolution</h2>
              <div className="cs-meta">
                <div>
                  <span className="cs-detail__label">Type</span>
                  <span>
                    {complaint.resolutionType ? (
                      <span className="cs-badge cs-badge--status-resolved">
                        {RESOLUTION_TYPE_LABELS[complaint.resolutionType as ComplaintResolutionType] ?? complaint.resolutionType}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                {complaint.resolutionNotes && (
                  <div>
                    <span className="cs-detail__label">Notes</span>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{complaint.resolutionNotes}</span>
                  </div>
                )}
                <div>
                  <span className="cs-detail__label">Resolved At</span>
                  <span>{new Date(complaint.resolvedAt).toLocaleString()}</span>
                </div>
                {complaint.assignee && (
                  <div>
                    <span className="cs-detail__label">Resolved By</span>
                    <span>
                      {complaint.assignee.firstName} {complaint.assignee.lastName}
                      {complaint.assignee.position?.title ? ` — ${complaint.assignee.position.title}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Timeline card */}
          <section className="cs-card">
            <h2 className="cs-card__title">Timeline</h2>
            <div className="cs-meta">
              <div>
                <span className="cs-detail__label">Created</span>
                <span>{new Date(complaint.createdAt).toLocaleString()}</span>
              </div>
              {complaint.assignedAt && (
                <div>
                  <span className="cs-detail__label">Assigned</span>
                  <span>{new Date(complaint.assignedAt).toLocaleString()}</span>
                  {complaint.assignee && (
                    <span className="cs-meta__by">
                      to {complaint.assignee.firstName} {complaint.assignee.lastName}
                    </span>
                  )}
                </div>
              )}
              {complaint.resolvedAt && (
                <div>
                  <span className="cs-detail__label">Resolved</span>
                  <span>{new Date(complaint.resolvedAt).toLocaleString()}</span>
                </div>
              )}
              {complaint.closedAt && (
                <div>
                  <span className="cs-detail__label">Closed</span>
                  <span>{new Date(complaint.closedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
