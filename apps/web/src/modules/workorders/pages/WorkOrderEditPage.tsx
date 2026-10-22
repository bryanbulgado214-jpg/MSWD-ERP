import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getCcf, getCcfLookup, getWorkOrder, updateWorkOrder } from '../api';
import {
  CCF_STATUS_LABELS,
  WO_TYPE_LABELS,
  type CcfLookup,
  type WorkOrder,
  type WorkOrderType,
} from '../types';
import '../workorders.css';

// datetime-local wants a local wall-clock value, not the ISO/UTC string.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function WorkOrderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [woNumber, setWoNumber] = useState('');
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [leaderReceivedAt, setLeaderReceivedAt] = useState('');
  const [instructions, setInstructions] = useState('');
  const [remarks, setRemarks] = useState('');
  const [sigRequired, setSigRequired] = useState(false);
  // Optional CCF mapping — what complaint this work order is for.
  const [customerConcernId, setCustomerConcernId] = useState('');
  const [ccfOptions, setCcfOptions] = useState<CcfLookup[]>([]);

  useEffect(() => {
    getCcfLookup().then(setCcfOptions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    getWorkOrder(id)
      .then((order) => {
        setWo(order);
        setWoNumber(order.woNumber);
        setPriority(order.priority);
        setTitle(order.title);
        setDescription(order.description ?? '');
        setCustomerName(order.customerName ?? '');
        setContactNumber(order.contactNumber ?? '');
        setLocation(order.location ?? '');
        setScheduledDate(order.scheduledDate ? order.scheduledDate.slice(0, 10) : '');
        setLeaderReceivedAt(order.leaderReceivedAt ? toLocalInput(order.leaderReceivedAt) : '');
        setInstructions(order.instructions ?? '');
        setRemarks(order.remarks ?? '');
        setSigRequired(order.customerSignatureRequired);
        setCustomerConcernId(order.customerConcernId ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Linking to a CCF auto-captures the complainant (and account) and location.
  function pickCcf(ccfId: string) {
    setCustomerConcernId(ccfId);
    if (!ccfId) return;
    getCcf(ccfId)
      .then((c) => {
        setCustomerName(`${c.customerName}${c.accountNumber ? ` (${c.accountNumber})` : ''}`);
        if (c.contactNumber) setContactNumber(c.contactNumber);
        if (c.location) setLocation(c.location);
        if (c.nature) setTitle(c.nature.slice(0, 255));
      })
      .catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wo) return;
    setSaving(true);
    setError('');
    try {
      await updateWorkOrder(wo.id, {
        expectedVersion: wo.version,
        ...(woNumber.trim() ? { woNumber: woNumber.trim() } : {}),
        priority,
        title,
        description,
        customerName,
        contactNumber,
        location,
        instructions,
        remarks,
        leaderReceivedAt: leaderReceivedAt ? new Date(leaderReceivedAt).toISOString() : null,
        customerSignatureRequired: sigRequired,
        customerConcernId: customerConcernId || null,
        ...(scheduledDate ? { scheduledDate } : {}),
      });
      navigate(`/work-orders/${wo.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update work order');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="wo-loading">Loading...</p>;
  if (error && !wo) return <div className="wo-error">{error}</div>;
  if (!wo) return <div className="wo-error">Work order not found</div>;

  if (!['draft', 'pending', 'assigned'].includes(wo.status)) {
    return (
      <div className="wo-page">
        <div className="wo-error">
          This work order is <strong>{wo.status}</strong> and can no longer be edited.
        </div>
        <button type="button" className="wo-btn" onClick={() => navigate(`/work-orders/${wo.id}`)}>
          &larr; Back to Detail
        </button>
      </div>
    );
  }

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>Edit {wo.woNumber}</h1>
      </div>
      {error && <div className="wo-error">{error}</div>}
      <form onSubmit={handleSubmit} className="wo-form">
        <div className="wo-form__grid">
          <label className="wo-form__field">
            <span className="wo-form__label">Work Order No.</span>
            <input className="wo-input" value={woNumber} onChange={(e) => setWoNumber(e.target.value)} maxLength={20} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Task Type</span>
            <input className="wo-input" value={WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type} disabled />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Priority</span>
            <select className="wo-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Details/Nature of Complaint/Concern *</span>
            <input className="wo-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Customer / Complainant</span>
            <input className="wo-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Contact Number</span>
            <input className="wo-input" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} maxLength={50} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Location</span>
            <input className="wo-input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Date</span>
            <input type="date" className="wo-input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Date &amp; Time Received</span>
            <input
              type="datetime-local"
              className="wo-input"
              value={leaderReceivedAt}
              onChange={(e) => setLeaderReceivedAt(e.target.value)}
            />
            <span style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
              When the team leader received the printed work order.
            </span>
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Customer Complaint (CCF) — optional</span>
            <select
              className="wo-select"
              value={customerConcernId}
              onChange={(e) => pickCcf(e.target.value)}
            >
              <option value="">Not from a complaint</option>
              {ccfOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.referenceNumber} — {c.customerName} ({CCF_STATUS_LABELS[c.status]})
                </option>
              ))}
            </select>
          </label>
          <label className="wo-form__field" style={{ justifyContent: 'flex-end' }}>
            <span className="wo-form__label">Customer signature</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingTop: 6 }}>
              <input type="checkbox" checked={sigRequired} onChange={(e) => setSigRequired(e.target.checked)} />
              Required on printout
            </label>
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Description</span>
            <textarea className="wo-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Detailed Instructions</span>
            <textarea className="wo-textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} />
          </label>
          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Remarks</span>
            <textarea className="wo-textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </label>
        </div>
        <div className="wo-form__actions">
          <button type="button" className="wo-btn" onClick={() => navigate(`/work-orders/${wo.id}`)}>Cancel</button>
          <button type="submit" className="wo-btn wo-btn--primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
