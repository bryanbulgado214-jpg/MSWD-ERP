import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createCcf, getNextCcfReference } from '../api';
import { CCF_CATEGORY_LABELS, type CcfCategory } from '../types';
import '../workorders.css';

const CATEGORIES = Object.keys(CCF_CATEGORY_LABELS) as CcfCategory[];

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CcfNewPage() {
  const navigate = useNavigate();
  const [seriesNo, setSeriesNo] = useState('');
  const [receivedAt, setReceivedAt] = useState(nowLocal());
  const [customerName, setCustomerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [category, setCategory] = useState<CcfCategory>('billing');
  const [location, setLocation] = useState('');
  const [nature, setNature] = useState('');
  const [requestedAction, setRequestedAction] = useState('');
  const [targetResolutionDate, setTargetResolutionDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill the Series No. with the suggested next value (still editable).
  useEffect(() => {
    getNextCcfReference()
      .then((ref) => setSeriesNo((cur) => cur || ref))
      .catch(() => {});
  }, []);

  const canSubmit = seriesNo.trim() && customerName.trim() && nature.trim() && receivedAt && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const ccf = await createCcf({
        referenceNumber: seriesNo.trim(),
        receivedAt: new Date(receivedAt).toISOString(),
        customerName: customerName.trim(),
        ...(accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {}),
        category,
        nature: nature.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(requestedAction.trim() ? { requestedAction: requestedAction.trim() } : {}),
        ...(targetResolutionDate ? { targetResolutionDate } : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      });
      navigate(`/work-orders/ccf/${ccf.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the CCF.');
      setSaving(false);
    }
  }

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <h1>New Customer Complaint/Concern Form</h1>
        <Link to="/work-orders/ccf" className="wo-btn wo-btn--nav">
          &larr; Back to CCF list
        </Link>
      </div>

      {error && <div className="wo-error">{error}</div>}

      <form onSubmit={handleSubmit} className="wo-form">
        <div className="wo-form__grid">
          <div className="wo-form__field">
            <label className="wo-form__label">Series No. *</label>
            <input
              type="text"
              className="wo-input"
              value={seriesNo}
              onChange={(e) => setSeriesNo(e.target.value)}
              maxLength={20}
              placeholder="e.g. CCF-000002"
              required
            />
            <span style={{ fontSize: 11, color: '#98a2b3' }}>Suggested — edit if needed.</span>
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Date &amp; Time Received *</label>
            <input
              type="datetime-local"
              className="wo-input"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              required
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Category *</label>
            <select
              className="wo-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as CcfCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CCF_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Customer Name *</label>
            <input
              type="text"
              className="wo-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Account No.</label>
            <input
              type="text"
              className="wo-input"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              maxLength={50}
            />
          </div>
          <div className="wo-form__field wo-form__field--full">
            <label className="wo-form__label">Location</label>
            <input
              type="text"
              className="wo-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={255}
              placeholder="Address or area of the complaint"
            />
          </div>
          <div className="wo-form__field wo-form__field--full">
            <label className="wo-form__label">Details/Nature of Complaint/Concern *</label>
            <textarea
              className="wo-textarea"
              value={nature}
              onChange={(e) => setNature(e.target.value)}
              rows={3}
              required
            />
          </div>
          <div className="wo-form__field wo-form__field--full">
            <label className="wo-form__label">Requested Action</label>
            <textarea
              className="wo-textarea"
              value={requestedAction}
              onChange={(e) => setRequestedAction(e.target.value)}
              rows={2}
              placeholder="What the customer is asking for"
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Target Completion Date</label>
            <input
              type="date"
              className="wo-input"
              value={targetResolutionDate}
              onChange={(e) => setTargetResolutionDate(e.target.value)}
            />
          </div>
          <div className="wo-form__field wo-form__field--full">
            <label className="wo-form__label">Remarks</label>
            <textarea
              className="wo-textarea"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="wo-form__actions">
          <button type="button" className="wo-btn" onClick={() => navigate('/work-orders/ccf')}>
            Cancel
          </button>
          <button type="submit" className="wo-btn wo-btn--primary" disabled={!canSubmit}>
            {saving ? 'Saving…' : 'Create CCF'}
          </button>
        </div>
      </form>
    </div>
  );
}
