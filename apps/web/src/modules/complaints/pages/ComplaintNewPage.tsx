import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createComplaint, getConsumersLookup } from '../api';
import '../complaints.css';

interface ConsumerOption { id: string; accountNumber: string; firstName: string; lastName: string }

const COMPLAINT_TYPES: { value: string; label: string }[] = [
  { value: 'water_quality', label: 'Water Quality' },
  { value: 'billing_dispute', label: 'Billing Dispute' },
  { value: 'service_interruption', label: 'Service Interruption' },
  { value: 'leak_report', label: 'Leak Report' },
  { value: 'meter_issue', label: 'Meter Issue' },
  { value: 'low_pressure', label: 'Low Pressure' },
  { value: 'no_water', label: 'No Water' },
  { value: 'illegal_connection', label: 'Illegal Connection' },
  { value: 'staff_conduct', label: 'Staff Conduct' },
  { value: 'other', label: 'Other' },
];

export default function ComplaintNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [consumers, setConsumers] = useState<ConsumerOption[]>([]);

  const [type, setType] = useState('');
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consumerId, setConsumerId] = useState('');

  useEffect(() => {
    getConsumersLookup().then(setConsumers).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const complaint = await createComplaint({
        type,
        subject,
        description,
        ...(priority && priority !== 'normal' ? { priority } : {}),
        ...(location ? { location } : {}),
        ...(contactName ? { contactName } : {}),
        ...(contactPhone ? { contactPhone } : {}),
        ...(contactEmail ? { contactEmail } : {}),
        ...(consumerId ? { consumerId } : {}),
      });
      navigate(`/complaints/${complaint.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create complaint');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cs-page">
      <div className="cs-page__header">
        <h1>New Complaint</h1>
      </div>

      {error && <div className="cs-error">{error}</div>}

      <form onSubmit={handleSubmit} className="cs-form">
        <div className="cs-form__grid">
          <label className="cs-form__field">
            <span className="cs-form__label">Type *</span>
            <select className="cs-select" value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="" disabled>— Select Type —</option>
              {COMPLAINT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </label>

          <label className="cs-form__field">
            <span className="cs-form__label">Priority</span>
            <select className="cs-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label className="cs-form__field cs-form__field--full">
            <span className="cs-form__label">Subject *</span>
            <input
              className="cs-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
              placeholder="Brief summary of the complaint"
            />
          </label>

          <label className="cs-form__field cs-form__field--full">
            <span className="cs-form__label">Description</span>
            <textarea
              className="cs-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Detailed description of the issue"
            />
          </label>

          <label className="cs-form__field">
            <span className="cs-form__label">Location</span>
            <input
              className="cs-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or area"
            />
          </label>

          <label className="cs-form__field">
            <span className="cs-form__label">Consumer</span>
            <select className="cs-select" value={consumerId} onChange={(e) => setConsumerId(e.target.value)}>
              <option value="">— None —</option>
              {consumers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.accountNumber} — {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </label>

          <label className="cs-form__field">
            <span className="cs-form__label">Contact Name</span>
            <input
              className="cs-input"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Complainant name"
            />
          </label>

          <label className="cs-form__field">
            <span className="cs-form__label">Contact Phone</span>
            <input
              className="cs-input"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Phone number"
            />
          </label>

          <label className="cs-form__field">
            <span className="cs-form__label">Contact Email</span>
            <input
              type="email"
              className="cs-input"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Email address"
            />
          </label>
        </div>

        <div className="cs-form__actions">
          <Link to="/complaints" className="cs-btn">Cancel</Link>
          <button type="submit" className="cs-btn cs-btn--primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Complaint'}
          </button>
        </div>
      </form>
    </div>
  );
}
