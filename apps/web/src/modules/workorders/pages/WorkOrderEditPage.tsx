import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getConsumersLookup, getEmployeesLookup, getWorkOrder, updateWorkOrder } from '../api';
import type { WorkOrder } from '../types';
import '../workorders.css';

interface ConsumerOption { id: string; accountNumber: string; firstName: string; lastName: string }
interface EmployeeOption { id: string; firstName: string; lastName: string; position?: { title: string } | null }

export default function WorkOrderEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [consumers, setConsumers] = useState<ConsumerOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [consumerId, setConsumerId] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [estimatedHrs, setEstimatedHrs] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getWorkOrder(id),
      getConsumersLookup().catch(() => [] as ConsumerOption[]),
      getEmployeesLookup().catch(() => [] as EmployeeOption[]),
    ]).then(([order, cons, emps]) => {
      setWo(order);
      setConsumers(cons);
      setEmployees(emps);
      setPriority(order.priority);
      setTitle(order.title);
      setDescription(order.description ?? '');
      setConsumerId(order.consumerId ?? '');
      setLocation(order.location ?? '');
      setScheduledDate(order.scheduledDate ? order.scheduledDate.slice(0, 10) : '');
      setEstimatedHrs(order.estimatedDurationHrs ? String(Number(order.estimatedDurationHrs)) : '');
    }).catch((e) => setError(e.message))
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
        ...(description !== (wo.description ?? '') ? { description } : {}),
        ...(consumerId ? { consumerId } : {}),
        ...(location ? { location } : {}),
        ...(scheduledDate ? { scheduledDate } : {}),
        ...(estimatedHrs ? { estimatedDurationHrs: Number(estimatedHrs) } : {}),
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

  const canEdit = ['draft', 'pending'].includes(wo.status);
  if (!canEdit) {
    return (
      <div className="wo-page">
        <div className="wo-error">
          This work order is in <strong>{wo.status}</strong> status and cannot be edited.
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
            <span className="wo-form__label">Type</span>
            <input className="wo-input" value={wo.type} disabled />
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
            <input
              className="wo-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Description</span>
            <textarea
              className="wo-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Consumer</span>
            <select className="wo-select" value={consumerId} onChange={(e) => setConsumerId(e.target.value)}>
              <option value="">— None —</option>
              {consumers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.accountNumber} — {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Location</span>
            <input
              className="wo-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Scheduled Date</span>
            <input
              type="date"
              className="wo-input"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </label>

          <label className="wo-form__field">
            <span className="wo-form__label">Estimated Duration (hrs)</span>
            <input
              type="number"
              step="0.5"
              min="0"
              className="wo-input"
              value={estimatedHrs}
              onChange={(e) => setEstimatedHrs(e.target.value)}
            />
          </label>
        </div>

        <div className="wo-form__actions">
          <button type="button" className="wo-btn" onClick={() => navigate(`/work-orders/${wo.id}`)}>
            Cancel
          </button>
          <button type="submit" className="wo-btn wo-btn--primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
