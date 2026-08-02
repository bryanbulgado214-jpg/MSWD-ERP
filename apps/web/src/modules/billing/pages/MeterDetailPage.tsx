import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { BillingApiError, getMeter, updateMeter } from '../api';
import type { Meter } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Meter };

const METER_SIZES: Record<string, string> = {
  half_inch: '1/2"', three_quarter_inch: '3/4"', one_inch: '1"',
  one_half_inch: '1-1/2"', two_inch: '2"', three_inch: '3"', four_inch: '4"',
};

export default function MeterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [brand, setBrand] = useState('');
  const [meterStatus, setMeterStatus] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    if (!id) return;
    try {
      const data = await getMeter(id);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed to load meter.' });
    }
  }

  useEffect(() => { load(); }, [id]);

  function startEdit(m: Meter) {
    setBrand(m.brand || '');
    setMeterStatus(m.status);
    setNotes(m.notes || '');
    setFormError('');
    setEditing(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== 'loaded' || !id) return;
    setSaving(true);
    setFormError('');
    try {
      await updateMeter(id, { brand, status: meterStatus, notes });
      setEditing(false);
      load();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to update meter.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'loading') return <div className="bill-page"><BillingSubNav /><p>Loading...</p></div>;
  if (state.status === 'error') return <div className="bill-page"><BillingSubNav /><div className="bill-error">{state.message}</div></div>;

  const m = state.data;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <Link to="/billing/meters" className="bill-back-link">&larr; Back to Meters</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Meter {m.serialNumber}</h1>
        <span className={`bill-badge bill-badge--${m.status}`}>{m.status}</span>
      </div>

      {!editing && (
        <>
          <dl className="bill-detail-grid">
            <div className="bill-detail-field"><dt>Serial Number</dt><dd>{m.serialNumber}</dd></div>
            <div className="bill-detail-field"><dt>Brand</dt><dd>{m.brand || '--'}</dd></div>
            <div className="bill-detail-field"><dt>Size</dt><dd>{m.size ? METER_SIZES[m.size] || m.size.replace(/_/g, ' ') : '--'}</dd></div>
            <div className="bill-detail-field"><dt>Initial Reading</dt><dd className="bill-text-mono">{m.initialReading}</dd></div>
            <div className="bill-detail-field"><dt>Last Reading</dt><dd className="bill-text-mono">{m.lastReading ?? '--'}</dd></div>
            <div className="bill-detail-field"><dt>Notes</dt><dd>{m.notes || '--'}</dd></div>
          </dl>
          {hasPermission('billing.meter.manage') && (
            <button type="button" className="bill-btn bill-btn--primary" onClick={() => startEdit(m)}>Edit Meter</button>
          )}
        </>
      )}

      {editing && (
        <form className="bill-form" onSubmit={handleUpdate}>
          {formError && <div className="bill-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Brand</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Status</label>
              <select value={meterStatus} onChange={(e) => setMeterStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="condemned">Condemned</option>
                <option value="for_repair">For Repair</option>
              </select>
            </div>
            <div className="bill-field">
              <label>Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Update Meter'}
            </button>
          </div>
        </form>
      )}

      <h3 className="bill-section-title">Assignment History</h3>
      {m.consumerMeters.length === 0 ? (
        <div className="bill-empty">This meter has never been assigned.</div>
      ) : (
        <table className="bill-table">
          <thead>
            <tr>
              <th>Account #</th>
              <th>Consumer</th>
              <th>Status</th>
              <th>Installed</th>
              <th>Removed</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            {m.consumerMeters.map((cm) => (
              <tr key={cm.id}>
                <td>
                  <Link to={`/billing/consumers/${cm.consumerId}`} className="bill-table__link">
                    {cm.consumer?.accountNumber}
                  </Link>
                </td>
                <td>{cm.consumer ? `${cm.consumer.lastName}, ${cm.consumer.firstName}` : '--'}</td>
                <td>{cm.consumer ? <span className={`bill-badge bill-badge--${cm.consumer.status}`}>{cm.consumer.status}</span> : '--'}</td>
                <td>{new Date(cm.installedDate).toLocaleDateString()}</td>
                <td>{cm.removedDate ? new Date(cm.removedDate).toLocaleDateString() : '--'}</td>
                <td>
                  {cm.isCurrent
                    ? <span className="bill-badge bill-badge--active">Yes</span>
                    : <span className="bill-badge bill-badge--inactive">No</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
