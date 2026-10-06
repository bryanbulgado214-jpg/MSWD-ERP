import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getWorkOrder, updateWorkOrder } from '../api';
import { WO_TYPE_LABELS, type WorkOrder, type WorkOrderType } from '../types';
import '../workorders.css';

export default function WorkOrderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [remarks, setRemarks] = useState('');
  const [sigRequired, setSigRequired] = useState(false);

  useEffect(() => {
    if (!id) return;
    getWorkOrder(id)
      .then((order) => {
        setWo(order);
        setPriority(order.priority);
        setTitle(order.title);
        setDescription(order.description ?? '');
        setCustomerName(order.customerName ?? '');
        setLocation(order.location ?? '');
        setScheduledDate(order.scheduledDate ? order.scheduledDate.slice(0, 10) : '');
        setInstructions(order.instructions ?? '');
        setRemarks(order.remarks ?? '');
        setSigRequired(order.customerSignatureRequired);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wo) return;
    setSaving(true);
    setError('');
    try {
      await updateWorkOrder(wo.id, {
        expectedVersion: wo.version,
        priority,
        title,
        description,
        customerName,
        location,
        instructions,
        remarks,
        customerSignatureRequired: sigRequired,
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
            <span className="wo-form__label">Title *</span>
            <input className="wo-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Customer / Account</span>
            <input className="wo-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Location</span>
            <input className="wo-input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="wo-form__field">
            <span className="wo-form__label">Scheduled Date</span>
            <input type="date" className="wo-input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
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
            <span className="wo-form__label">Instructions to crew</span>
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
