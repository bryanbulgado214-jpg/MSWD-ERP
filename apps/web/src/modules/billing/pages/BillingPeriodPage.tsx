import { useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError, createBillingPeriod, getBillingPeriods,
  transitionPeriod, updateBillingPeriod,
} from '../api';
import type { BillingPeriod, BillingPeriodStatus } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: BillingPeriod[] };

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_LABELS: Record<BillingPeriodStatus, string> = {
  open: 'Open', reading: 'Reading', billing: 'Billing', closed: 'Closed',
};

const NEXT_STATUS: Record<string, { label: string; value: BillingPeriodStatus }> = {
  open: { label: 'Start Reading', value: 'reading' },
  reading: { label: 'Start Billing', value: 'billing' },
  billing: { label: 'Close Period', value: 'closed' },
};

export default function BillingPeriodPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [name, setName] = useState('');
  const [billingMonth, setBillingMonth] = useState(new Date().getMonth() + 1);
  const [billingYear, setBillingYear] = useState(new Date().getFullYear());
  const [readingStartDate, setReadingStartDate] = useState('');
  const [readingEndDate, setReadingEndDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [penaltyDate, setPenaltyDate] = useState('');

  function resetForm() {
    setName(''); setBillingMonth(new Date().getMonth() + 1);
    setBillingYear(new Date().getFullYear());
    setReadingStartDate(''); setReadingEndDate('');
    setDueDate(''); setPenaltyDate('');
    setFormError(''); setShowForm(false);
  }

  async function load() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const data = await getBillingPeriods(params.toString() || undefined);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed to load billing periods.' });
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  useEffect(() => {
    if (showForm && !name) {
      setName(`${MONTH_NAMES[billingMonth]} ${billingYear}`);
    }
  }, [billingMonth, billingYear, showForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await createBillingPeriod({
        name, billingMonth, billingYear,
        ...(readingStartDate ? { readingStartDate } : {}),
        ...(readingEndDate ? { readingEndDate } : {}),
        dueDate, penaltyDate,
      });
      resetForm();
      load();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to create billing period.');
    } finally { setSaving(false); }
  }

  async function handleTransition(period: BillingPeriod, nextStatus: BillingPeriodStatus) {
    if (!confirm(`Transition "${period.name}" to "${STATUS_LABELS[nextStatus]}"?`)) return;
    try {
      await transitionPeriod(period.id, { expectedVersion: period.version, status: nextStatus });
      load();
    } catch (err) {
      alert(err instanceof BillingApiError ? err.message : 'Transition failed.');
    }
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Billing Periods</h1>

      <div className="bill-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="reading">Reading</option>
          <option value="billing">Billing</option>
          <option value="closed">Closed</option>
        </select>
        {hasPermission('billing.period.manage') && (
          <button className="bill-btn bill-btn--primary" type="button"
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
            {showForm ? 'Cancel' : 'New Period'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="bill-form" onSubmit={handleSubmit}>
          {formError && <div className="bill-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Month</label>
              <select value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))}>
                {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="bill-field">
              <label>Year</label>
              <input type="number" min="2020" value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} />
            </div>
            <div className="bill-field">
              <label>Due Date *</label>
              <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Reading Start</label>
              <input type="date" value={readingStartDate} onChange={(e) => setReadingStartDate(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Reading End</label>
              <input type="date" value={readingEndDate} onChange={(e) => setReadingEndDate(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Penalty Date *</label>
              <input type="date" required value={penaltyDate} onChange={(e) => setPenaltyDate(e.target.value)} />
            </div>
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={resetForm}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Period'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <p>Loading...</p>}
      {state.status === 'error' && <div className="bill-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="bill-empty">No billing periods found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="bill-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Month/Year</th>
              <th>Due Date</th>
              <th>Penalty Date</th>
              <th>Readings</th>
              <th>Bills</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{MONTH_NAMES[p.billingMonth]} {p.billingYear}</td>
                <td>{new Date(p.dueDate).toLocaleDateString()}</td>
                <td>{new Date(p.penaltyDate).toLocaleDateString()}</td>
                <td className="bill-text-mono">{p._count.meterReadings}</td>
                <td className="bill-text-mono">{p._count.bills}</td>
                <td>
                  <span className={`bill-badge bill-badge--${p.status}`}>
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td>
                  {hasPermission('billing.period.manage') && NEXT_STATUS[p.status] && (
                    <button type="button" className="bill-btn bill-btn--primary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => handleTransition(p, NEXT_STATUS[p.status].value)}>
                      {NEXT_STATUS[p.status].label}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
