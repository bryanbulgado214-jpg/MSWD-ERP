import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { BillingApiError, createMeter, getMeters } from '../api';
import type { MeterListItem, MeterSize } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: MeterListItem[] };

const METER_SIZES: { value: MeterSize; label: string }[] = [
  { value: 'half_inch', label: '1/2"' },
  { value: 'three_quarter_inch', label: '3/4"' },
  { value: 'one_inch', label: '1"' },
  { value: 'one_half_inch', label: '1-1/2"' },
  { value: 'two_inch', label: '2"' },
  { value: 'three_inch', label: '3"' },
  { value: 'four_inch', label: '4"' },
];

export default function MeterRegistryPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [serialNumber, setSerialNumber] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState<string>('half_inch');
  const [initialReading, setInitialReading] = useState('0');
  const [meterNotes, setMeterNotes] = useState('');

  function resetForm() {
    setSerialNumber(''); setBrand(''); setSize('half_inch');
    setInitialReading('0'); setMeterNotes('');
    setFormError(''); setShowForm(false);
  }

  async function load() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const qs = params.toString();
      const data = await getMeters(qs || undefined);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed to load meters.' });
    }
  }

  useEffect(() => { load(); }, [statusFilter, search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await createMeter({
        serialNumber,
        ...(brand ? { brand } : {}),
        ...(size ? { size } : {}),
        initialReading: Number(initialReading),
        ...(meterNotes ? { notes: meterNotes } : {}),
      });
      resetForm();
      load();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to create meter.');
    } finally {
      setSaving(false);
    }
  }

  function currentConsumer(m: MeterListItem) {
    const cm = m.consumerMeters.find((a) => a.isCurrent);
    if (!cm) return '--';
    return `${cm.consumer.lastName}, ${cm.consumer.firstName}`;
  }

  function sizeLabel(s: string | null) {
    if (!s) return '--';
    const found = METER_SIZES.find((ms) => ms.value === s);
    return found ? found.label : s.replace(/_/g, ' ');
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Meter Registry</h1>

      <div className="bill-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="condemned">Condemned</option>
          <option value="for_repair">For Repair</option>
        </select>
        <input
          type="text"
          placeholder="Search serial / brand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {hasPermission('billing.meter.manage') && (
          <button
            className="bill-btn bill-btn--primary"
            type="button"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'New Meter'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="bill-form" onSubmit={handleSubmit}>
          {formError && <div className="bill-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Serial Number *</label>
              <input required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Brand</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Size</label>
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                {METER_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="bill-field">
              <label>Initial Reading</label>
              <input type="number" min="0" value={initialReading} onChange={(e) => setInitialReading(e.target.value)} />
            </div>
          </div>
          <div className="bill-field">
            <label>Notes</label>
            <textarea rows={2} value={meterNotes} onChange={(e) => setMeterNotes(e.target.value)} />
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={resetForm}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Meter'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <p>Loading meters...</p>}
      {state.status === 'error' && <div className="bill-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="bill-empty">No meters found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="bill-table">
          <thead>
            <tr>
              <th>Serial #</th>
              <th>Brand</th>
              <th>Size</th>
              <th>Initial</th>
              <th>Assigned To</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/billing/meters/${m.id}`} className="bill-table__link">
                    {m.serialNumber}
                  </Link>
                </td>
                <td>{m.brand || '--'}</td>
                <td>{sizeLabel(m.size)}</td>
                <td className="bill-text-mono">{m.initialReading}</td>
                <td>{currentConsumer(m)}</td>
                <td><span className={`bill-badge bill-badge--${m.status}`}>{m.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
