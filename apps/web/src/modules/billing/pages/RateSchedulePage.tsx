import { Fragment, useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import { BillingApiError, createRateSchedule, getRateSchedules, updateRateSchedule } from '../api';
import type { ConsumerType, RateSchedule } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: RateSchedule[] };

interface TierRow {
  minConsumption: string;
  maxConsumption: string;
  ratePerCubicMeter: string;
}

const CONSUMER_TYPES: ConsumerType[] = [
  'residential',
  'commercial',
  'industrial',
  'government',
  'institutional',
];

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function RateSchedulePage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editVersion, setEditVersion] = useState(0);

  const [name, setName] = useState('');
  const [consumerType, setConsumerType] = useState<string>('residential');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minimumCharge, setMinimumCharge] = useState('0');
  const [minimumConsumption, setMinimumConsumption] = useState('10');
  const [environmentalFee, setEnvironmentalFee] = useState('0');
  const [sewerCharge, setSewerCharge] = useState('0');
  const [maintenanceFee, setMaintenanceFee] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [tiers, setTiers] = useState<TierRow[]>([
    { minConsumption: '0', maxConsumption: '10', ratePerCubicMeter: '0' },
    { minConsumption: '11', maxConsumption: '20', ratePerCubicMeter: '0' },
    { minConsumption: '21', maxConsumption: '', ratePerCubicMeter: '0' },
  ]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setConsumerType('residential');
    setEffectiveDate('');
    setEndDate('');
    setMinimumCharge('0');
    setMinimumConsumption('10');
    setEnvironmentalFee('0');
    setSewerCharge('0');
    setMaintenanceFee('0');
    setIsActive(true);
    setEditingId('');
    setEditVersion(0);
    setTiers([
      { minConsumption: '0', maxConsumption: '10', ratePerCubicMeter: '0' },
      { minConsumption: '11', maxConsumption: '20', ratePerCubicMeter: '0' },
      { minConsumption: '21', maxConsumption: '', ratePerCubicMeter: '0' },
    ]);
    setFormError('');
    setShowForm(false);
  }

  function startEdit(rs: RateSchedule) {
    setEditingId(rs.id);
    setEditVersion(rs.version);
    setName(rs.name);
    setConsumerType(rs.consumerType);
    setEffectiveDate(rs.effectiveDate.slice(0, 10));
    setEndDate(rs.endDate ? rs.endDate.slice(0, 10) : '');
    setMinimumCharge(rs.minimumCharge);
    setMinimumConsumption(rs.minimumConsumption);
    setEnvironmentalFee(rs.environmentalFee);
    setSewerCharge(rs.sewerCharge);
    setMaintenanceFee(rs.maintenanceFee);
    setIsActive(rs.isActive);
    setTiers(
      rs.tiers.map((t) => ({
        minConsumption: t.minConsumption,
        maxConsumption: t.maxConsumption || '',
        ratePerCubicMeter: t.ratePerCubicMeter,
      })),
    );
    setFormError('');
    setShowForm(true);
  }

  async function load() {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('consumerType', typeFilter);
      const qs = params.toString();
      const data = await getRateSchedules(qs || undefined);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof BillingApiError ? err.message : 'Failed to load rate schedules.',
      });
    }
  }

  useEffect(() => {
    load();
  }, [typeFilter]);

  function addTier() {
    const lastTier = tiers[tiers.length - 1];
    const nextMin =
      lastTier && lastTier.maxConsumption ? String(Number(lastTier.maxConsumption) + 1) : '0';
    setTiers([...tiers, { minConsumption: nextMin, maxConsumption: '', ratePerCubicMeter: '0' }]);
  }

  function removeTier(idx: number) {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== idx));
  }

  function updateTier(idx: number, field: keyof TierRow, value: string) {
    setTiers(tiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const tierData = tiers.map((t, i) => ({
        minConsumption: Number(t.minConsumption),
        ...(t.maxConsumption
          ? { maxConsumption: Number(t.maxConsumption) }
          : { maxConsumption: null }),
        ratePerCubicMeter: Number(t.ratePerCubicMeter),
        sortOrder: i,
      }));

      if (editingId) {
        await updateRateSchedule(editingId, {
          expectedVersion: editVersion,
          name,
          effectiveDate,
          ...(endDate ? { endDate } : { endDate: null }),
          minimumCharge: Number(minimumCharge),
          minimumConsumption: Number(minimumConsumption),
          environmentalFee: Number(environmentalFee),
          sewerCharge: Number(sewerCharge),
          maintenanceFee: Number(maintenanceFee),
          isActive,
          tiers: tierData,
        });
      } else {
        await createRateSchedule({
          name,
          consumerType,
          effectiveDate,
          ...(endDate ? { endDate } : {}),
          minimumCharge: Number(minimumCharge),
          minimumConsumption: Number(minimumConsumption),
          environmentalFee: Number(environmentalFee),
          sewerCharge: Number(sewerCharge),
          maintenanceFee: Number(maintenanceFee),
          tiers: tierData,
        });
      }
      resetForm();
      load();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to save rate schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Rate Schedules</h1>

      <div className="bill-toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Consumer Types</option>
          {CONSUMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        {hasPermission('billing.rate.manage') && (
          <button
            className="bill-btn bill-btn--primary"
            type="button"
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? 'Cancel' : 'New Rate Schedule'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="bill-form" onSubmit={handleSubmit}>
          {formError && <div className="bill-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Residential 2026"
              />
            </div>
            <div className="bill-field">
              <label>Consumer Type</label>
              <select
                value={consumerType}
                onChange={(e) => setConsumerType(e.target.value)}
                disabled={!!editingId}
              >
                {CONSUMER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="bill-field">
              <label>Effective Date *</label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Minimum Charge</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minimumCharge}
                onChange={(e) => setMinimumCharge(e.target.value)}
              />
            </div>
            <div className="bill-field">
              <label>Min. Consumption (cu.m.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minimumConsumption}
                onChange={(e) => setMinimumConsumption(e.target.value)}
              />
            </div>
            <div className="bill-field">
              <label>Environmental Fee</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={environmentalFee}
                onChange={(e) => setEnvironmentalFee(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Sewer Charge</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sewerCharge}
                onChange={(e) => setSewerCharge(e.target.value)}
              />
            </div>
            <div className="bill-field">
              <label>Maintenance Fee</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={maintenanceFee}
                onChange={(e) => setMaintenanceFee(e.target.value)}
              />
            </div>
            {editingId && (
              <div className="bill-checkbox-row" style={{ alignSelf: 'end', marginBottom: '14px' }}>
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <label htmlFor="isActive">Active</label>
              </div>
            )}
          </div>

          <h3 className="bill-section-title" style={{ marginTop: '16px' }}>
            Rate Tiers
          </h3>
          <table className="bill-table" style={{ marginBottom: '12px' }}>
            <thead>
              <tr>
                <th>From (cu.m.)</th>
                <th>To (cu.m.)</th>
                <th>Rate / cu.m.</th>
                <th style={{ width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={tier.minConsumption}
                      onChange={(e) => updateTier(idx, 'minConsumption', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '4px',
                        fontSize: '13px',
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tier.maxConsumption}
                      onChange={(e) => updateTier(idx, 'maxConsumption', e.target.value)}
                      placeholder="No limit"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '4px',
                        fontSize: '13px',
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      required
                      value={tier.ratePerCubicMeter}
                      onChange={(e) => updateTier(idx, 'ratePerCubicMeter', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '4px',
                        fontSize: '13px',
                      }}
                    />
                  </td>
                  <td>
                    {tiers.length > 1 && (
                      <button
                        type="button"
                        className="bill-btn bill-btn--danger"
                        style={{ padding: '4px 8px', fontSize: '11px' }}
                        onClick={() => removeTier(idx)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="bill-btn"
            onClick={addTier}
            style={{ marginBottom: '12px' }}
          >
            + Add Tier
          </button>

          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={resetForm}>
              Cancel
            </button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <p>Loading rate schedules...</p>}
      {state.status === 'error' && <div className="bill-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="bill-empty">No rate schedules configured.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Effective</th>
                <th>Min. Charge</th>
                <th>Min. cu.m.</th>
                <th>Tiers</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((rs) => (
                <Fragment key={rs.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{rs.name}</td>
                    <td>
                      <span className={`bill-badge bill-badge--${rs.consumerType}`}>
                        {rs.consumerType}
                      </span>
                    </td>
                    <td>
                      {new Date(rs.effectiveDate).toLocaleDateString()}
                      {rs.endDate ? ` — ${new Date(rs.endDate).toLocaleDateString()}` : ''}
                    </td>
                    <td className="bill-text-mono">{formatPeso(rs.minimumCharge)}</td>
                    <td className="bill-text-mono">{rs.minimumConsumption}</td>
                    <td>
                      <button
                        type="button"
                        className="bill-table__link"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                        onClick={() => setExpandedId(expandedId === rs.id ? null : rs.id)}
                      >
                        {rs.tiers.length} tier{rs.tiers.length !== 1 ? 's' : ''}{' '}
                        {expandedId === rs.id ? '▲' : '▼'}
                      </button>
                    </td>
                    <td>
                      <span
                        className={`bill-badge bill-badge--${rs.isActive ? 'active' : 'inactive'}`}
                      >
                        {rs.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {hasPermission('billing.rate.manage') && (
                        <button
                          type="button"
                          className="bill-btn"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={() => startEdit(rs)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === rs.id && (
                    <tr key={`${rs.id}-tiers`}>
                      <td colSpan={8} style={{ padding: '0 12px 12px', background: '#f8f9fc' }}>
                        <table className="bill-table" style={{ marginTop: '8px' }}>
                          <thead>
                            <tr>
                              <th>From (cu.m.)</th>
                              <th>To (cu.m.)</th>
                              <th>Rate / cu.m.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rs.tiers.map((t) => (
                              <tr key={t.id}>
                                <td className="bill-text-mono">{t.minConsumption}</td>
                                <td className="bill-text-mono">{t.maxConsumption ?? 'No limit'}</td>
                                <td className="bill-text-mono">
                                  {formatPeso(t.ratePerCubicMeter)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(Number(rs.environmentalFee) > 0 ||
                          Number(rs.sewerCharge) > 0 ||
                          Number(rs.maintenanceFee) > 0) && (
                          <div style={{ fontSize: '12px', color: '#667085', marginTop: '8px' }}>
                            {Number(rs.environmentalFee) > 0 && (
                              <span style={{ marginRight: '16px' }}>
                                Env. Fee: {formatPeso(rs.environmentalFee)}
                              </span>
                            )}
                            {Number(rs.sewerCharge) > 0 && (
                              <span style={{ marginRight: '16px' }}>
                                Sewer: {formatPeso(rs.sewerCharge)}
                              </span>
                            )}
                            {Number(rs.maintenanceFee) > 0 && (
                              <span>Maint.: {formatPeso(rs.maintenanceFee)}</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
