import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createWorkOrder, getConsumersLookup, getEmployeesLookup } from '../api';
import '../workorders.css';

interface ConsumerOption { id: string; accountNumber: string; firstName: string; lastName: string }
interface EmployeeOption { id: string; firstName: string; lastName: string; position?: { title: string } | null }

export default function WorkOrderNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [consumers, setConsumers] = useState<ConsumerOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [type, setType] = useState('repair');
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [consumerId, setConsumerId] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [estimatedHrs, setEstimatedHrs] = useState('');

  useEffect(() => {
    getConsumersLookup().then(setConsumers).catch(() => {});
    getEmployeesLookup().then(setEmployees).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const wo = await createWorkOrder({
        type,
        priority,
        title,
        ...(description ? { description } : {}),
        ...(consumerId ? { consumerId } : {}),
        ...(location ? { location } : {}),
        ...(scheduledDate ? { scheduledDate } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(estimatedHrs ? { estimatedDurationHrs: Number(estimatedHrs) } : {}),
      });
      navigate(`/work-orders/${wo.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create work order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>New Work Order</h1>
      </div>

      {error && <div className="wo-error">{error}</div>}

      <form onSubmit={handleSubmit} className="wo-form">
        <div className="wo-form__grid">
          <label className="wo-form__field">
            <span className="wo-form__label">Type *</span>
            <select className="wo-select" value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="installation">Installation</option>
              <option value="repair">Repair</option>
              <option value="replacement">Replacement</option>
              <option value="disconnection">Disconnection</option>
              <option value="reconnection">Reconnection</option>
              <option value="inspection">Inspection</option>
              <option value="maintenance">Maintenance</option>
            </select>
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
              placeholder="Brief description of the work"
            />
          </label>

          <label className="wo-form__field wo-form__field--full">
            <span className="wo-form__label">Description</span>
            <textarea
              className="wo-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detailed instructions or notes"
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
              placeholder="Address or area"
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

          <label className="wo-form__field">
            <span className="wo-form__label">Assign To</span>
            <select className="wo-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">— Unassigned —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}{emp.position ? ` — ${emp.position.title}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="wo-form__actions">
          <button type="button" className="wo-btn" onClick={() => navigate('/work-orders')}>
            Cancel
          </button>
          <button type="submit" className="wo-btn wo-btn--primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Work Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
