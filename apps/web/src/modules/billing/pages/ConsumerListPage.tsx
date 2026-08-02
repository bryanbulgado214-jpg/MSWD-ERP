import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { BillingApiError, createConsumer, getBarangays, getConsumers } from '../api';
import type { ConsumerListItem, ConsumerType } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: ConsumerListItem[] };

const CONSUMER_TYPES: ConsumerType[] = ['residential', 'commercial', 'industrial', 'government', 'institutional'];

export default function ConsumerListPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('');
  const [search, setSearch] = useState('');
  const [barangays, setBarangays] = useState<string[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [accountNumber, setAccountNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [consumerType, setConsumerType] = useState<string>('residential');
  const [address, setAddress] = useState('');
  const [barangay, setBarangay] = useState('');
  const [municipality, setMunicipality] = useState('Siquijor');
  const [province, setProvince] = useState('Siquijor');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isSeniorCitizen, setIsSeniorCitizen] = useState(false);
  const [isPwd, setIsPwd] = useState(false);
  const [connectionDate, setConnectionDate] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setAccountNumber(''); setFirstName(''); setMiddleName(''); setLastName('');
    setBusinessName(''); setConsumerType('residential'); setAddress('');
    setBarangay(''); setMunicipality('Siquijor'); setProvince('Siquijor');
    setContactNumber(''); setEmail(''); setIsSeniorCitizen(false);
    setIsPwd(false); setConnectionDate(''); setNotes('');
    setFormError(''); setShowForm(false);
  }

  async function load() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('consumerType', typeFilter);
      if (barangayFilter) params.set('barangay', barangayFilter);
      if (search) params.set('search', search);
      const qs = params.toString();
      const data = await getConsumers(qs || undefined);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed to load consumers.' });
    }
  }

  useEffect(() => { load(); }, [statusFilter, typeFilter, barangayFilter, search]);

  useEffect(() => {
    getBarangays().then(setBarangays).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await createConsumer({
        accountNumber, firstName, lastName, address,
        ...(middleName ? { middleName } : {}),
        ...(businessName ? { businessName } : {}),
        ...(consumerType ? { consumerType } : {}),
        ...(barangay ? { barangay } : {}),
        ...(municipality ? { municipality } : {}),
        ...(province ? { province } : {}),
        ...(contactNumber ? { contactNumber } : {}),
        ...(email ? { email } : {}),
        isSeniorCitizen, isPwd,
        ...(connectionDate ? { connectionDate } : {}),
        ...(notes ? { notes } : {}),
      });
      resetForm();
      load();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to create consumer.');
    } finally {
      setSaving(false);
    }
  }

  function currentMeter(c: ConsumerListItem) {
    const cm = c.consumerMeters.find((m) => m.isCurrent);
    return cm ? cm.meter.serialNumber : '--';
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Consumer Registry</h1>

      <div className="bill-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="disconnected">Disconnected</option>
          <option value="closed">Closed</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {CONSUMER_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
          <option value="">All Barangays</option>
          {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search name / account..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {hasPermission('billing.consumer.manage') && (
          <button
            className="bill-btn bill-btn--primary"
            type="button"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'New Consumer'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="bill-form" onSubmit={handleSubmit}>
          {formError && <div className="bill-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Account Number *</label>
              <input required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Consumer Type</label>
              <select value={consumerType} onChange={(e) => setConsumerType(e.target.value)}>
                {CONSUMER_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="bill-field">
              <label>Connection Date</label>
              <input type="date" value={connectionDate} onChange={(e) => setConnectionDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>First Name *</label>
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Middle Name</label>
              <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Last Name *</label>
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Business Name</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Address *</label>
              <input required value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Barangay</label>
              <input value={barangay} onChange={(e) => setBarangay(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Municipality</label>
              <input value={municipality} onChange={(e) => setMunicipality(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Province</label>
              <input value={province} onChange={(e) => setProvince(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Contact Number</label>
              <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '8px' }}>
            <div className="bill-checkbox-row">
              <input type="checkbox" id="isSenior" checked={isSeniorCitizen} onChange={(e) => setIsSeniorCitizen(e.target.checked)} />
              <label htmlFor="isSenior">Senior Citizen</label>
            </div>
            <div className="bill-checkbox-row">
              <input type="checkbox" id="isPwd" checked={isPwd} onChange={(e) => setIsPwd(e.target.checked)} />
              <label htmlFor="isPwd">Person with Disability (PWD)</label>
            </div>
          </div>
          <div className="bill-field">
            <label>Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={resetForm}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Consumer'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <p>Loading consumers...</p>}
      {state.status === 'error' && <div className="bill-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="bill-empty">No consumers found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="bill-table">
          <thead>
            <tr>
              <th>Account #</th>
              <th>Name</th>
              <th>Type</th>
              <th>Barangay</th>
              <th>Meter</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/billing/consumers/${c.id}`} className="bill-table__link">
                    {c.accountNumber}
                  </Link>
                </td>
                <td>{c.lastName}, {c.firstName}{c.middleName ? ` ${c.middleName.charAt(0)}.` : ''}</td>
                <td><span className={`bill-badge bill-badge--${c.consumerType}`}>{c.consumerType}</span></td>
                <td>{c.barangay || '--'}</td>
                <td className="bill-text-mono">{currentMeter(c)}</td>
                <td><span className={`bill-badge bill-badge--${c.status}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
