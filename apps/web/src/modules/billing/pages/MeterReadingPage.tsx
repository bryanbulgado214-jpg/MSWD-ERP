import { useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError, createMeterReading, generateBills,
  getBillingPeriods, getMeterReadings, getUnreadConsumers,
} from '../api';
import type { BillingPeriod, MeterReading } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: T };

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

interface UnreadConsumer {
  id: string; accountNumber: string; firstName: string; lastName: string; consumerType: string;
  consumerMeters: Array<{ isCurrent: boolean; meter: { id: string; serialNumber: string; initialReading: number } }>;
}

export default function MeterReadingPage() {
  const { hasPermission } = useAuth();
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [readings, setReadings] = useState<LoadState<MeterReading[]>>({ status: 'idle' });
  const [unread, setUnread] = useState<UnreadConsumer[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');

  const [selConsumer, setSelConsumer] = useState('');
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [currentReading, setCurrentReading] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    getBillingPeriods().then(setPeriods).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) { setReadings({ status: 'idle' }); return; }
    loadReadings();
  }, [selectedPeriodId]);

  async function loadReadings() {
    setReadings({ status: 'loading' });
    try {
      const data = await getMeterReadings(selectedPeriodId);
      setReadings({ status: 'loaded', data });
    } catch (err) {
      setReadings({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed.' });
    }
  }

  async function loadUnread() {
    if (!selectedPeriodId) return;
    try {
      const data = await getUnreadConsumers(selectedPeriodId);
      setUnread(data);
    } catch { setUnread([]); }
  }

  function openEntry() {
    setShowEntry(true);
    setSelConsumer(''); setCurrentReading(''); setRemarks('');
    setEntryError('');
    loadUnread();
  }

  const selectedUnread = unread.find((c) => c.id === selConsumer);
  const currentMeter = selectedUnread?.consumerMeters.find((cm) => cm.isCurrent)?.meter;
  const prevReading = currentMeter?.initialReading ?? 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnread || !currentMeter) return;
    setSaving(true); setEntryError('');
    try {
      await createMeterReading({
        consumerId: selectedUnread.id,
        meterId: currentMeter.id,
        billingPeriodId: selectedPeriodId,
        readingDate,
        previousReading: Number(prevReading),
        currentReading: Number(currentReading),
        ...(remarks ? { remarks } : {}),
      });
      setShowEntry(false);
      loadReadings();
    } catch (err) {
      setEntryError(err instanceof BillingApiError ? err.message : 'Failed to save reading.');
    } finally { setSaving(false); }
  }

  async function handleGenerateBills() {
    if (!confirm('Generate bills for all readings in this period?')) return;
    setGenerating(true); setGenResult('');
    try {
      const result = await generateBills(selectedPeriodId);
      setGenResult(`Generated ${result.generated} bill(s).`);
      loadReadings();
    } catch (err) {
      setGenResult(err instanceof BillingApiError ? err.message : 'Bill generation failed.');
    } finally { setGenerating(false); }
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Meter Readings</h1>

      <div className="bill-toolbar">
        <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)}>
          <option value="">Select Billing Period</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
          ))}
        </select>

        {selectedPeriodId && hasPermission('billing.reading.manage') &&
          selectedPeriod && (selectedPeriod.status === 'open' || selectedPeriod.status === 'reading') && (
          <button className="bill-btn bill-btn--primary" type="button" onClick={openEntry}>
            Record Reading
          </button>
        )}
        {selectedPeriodId && hasPermission('billing.bill.generate') &&
          selectedPeriod && (selectedPeriod.status === 'reading' || selectedPeriod.status === 'billing') && (
          <button className="bill-btn bill-btn--success" type="button" onClick={handleGenerateBills} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Bills'}
          </button>
        )}
      </div>

      {genResult && (
        <div className={genResult.startsWith('Generated') ? 'bill-success' : 'bill-error'} style={{ marginBottom: '12px' }}>
          {genResult}
        </div>
      )}

      {showEntry && (
        <form className="bill-form" onSubmit={handleSubmit}>
          {entryError && <div className="bill-error">{entryError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Consumer *</label>
              <select required value={selConsumer} onChange={(e) => setSelConsumer(e.target.value)}>
                <option value="">Select consumer...</option>
                {unread.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.accountNumber} — {c.lastName}, {c.firstName}
                  </option>
                ))}
              </select>
            </div>
            <div className="bill-field">
              <label>Reading Date</label>
              <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Previous Reading</label>
              <input type="number" readOnly value={prevReading} className="bill-text-mono" />
            </div>
            <div className="bill-field">
              <label>Current Reading *</label>
              <input type="number" required step="0.01" min={prevReading}
                value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} />
            </div>
          </div>
          {currentMeter && (
            <div style={{ fontSize: '12px', color: '#667085', margin: '4px 0 8px' }}>
              Meter: {currentMeter.serialNumber} | Consumption: {currentReading ? (Number(currentReading) - prevReading).toFixed(2) : '0.00'} cu.m.
            </div>
          )}
          <div className="bill-field" style={{ maxWidth: '400px' }}>
            <label>Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={() => setShowEntry(false)}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Reading'}
            </button>
          </div>
        </form>
      )}

      {readings.status === 'idle' && <div className="bill-empty">Select a billing period to view readings.</div>}
      {readings.status === 'loading' && <p>Loading readings...</p>}
      {readings.status === 'error' && <div className="bill-error">{readings.message}</div>}
      {readings.status === 'loaded' && readings.data.length === 0 && (
        <div className="bill-empty">No readings recorded for this period.</div>
      )}
      {readings.status === 'loaded' && readings.data.length > 0 && (
        <table className="bill-table">
          <thead>
            <tr>
              <th>Account #</th>
              <th>Consumer</th>
              <th>Meter</th>
              <th>Reading Date</th>
              <th>Previous</th>
              <th>Current</th>
              <th>Consumption</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {readings.data.map((r) => (
              <tr key={r.id}>
                <td className="bill-text-mono">{r.consumer.accountNumber}</td>
                <td>{r.consumer.lastName}, {r.consumer.firstName}</td>
                <td className="bill-text-mono">{r.meter.serialNumber}</td>
                <td>{new Date(r.readingDate).toLocaleDateString()}</td>
                <td className="bill-text-mono">{r.previousReading}</td>
                <td className="bill-text-mono">{r.currentReading}</td>
                <td className="bill-text-mono" style={{ fontWeight: 600 }}>{r.consumption}</td>
                <td>
                  <span className={`bill-badge bill-badge--${r.status}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
