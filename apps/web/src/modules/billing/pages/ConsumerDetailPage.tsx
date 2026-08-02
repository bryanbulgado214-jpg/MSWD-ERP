import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { assignMeter, BillingApiError, getConsumer, getUnassignedMeters, updateConsumer } from '../api';
import type { Consumer, MeterListItem } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Consumer };

export default function ConsumerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [barangay, setBarangay] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isSeniorCitizen, setIsSeniorCitizen] = useState(false);
  const [isPwd, setIsPwd] = useState(false);
  const [consumerStatus, setConsumerStatus] = useState('');
  const [notes, setNotes] = useState('');

  const [showAssignMeter, setShowAssignMeter] = useState(false);
  const [unassignedMeters, setUnassignedMeters] = useState<MeterListItem[]>([]);
  const [selectedMeterId, setSelectedMeterId] = useState('');
  const [installedDate, setInstalledDate] = useState('');
  const [meterRemarks, setMeterRemarks] = useState('');
  const [assigningSaving, setAssigningSaving] = useState(false);
  const [assignError, setAssignError] = useState('');

  async function load() {
    if (!id) return;
    try {
      const data = await getConsumer(id);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed to load consumer.' });
    }
  }

  useEffect(() => { load(); }, [id]);

  function startEdit(c: Consumer) {
    setFirstName(c.firstName);
    setMiddleName(c.middleName || '');
    setLastName(c.lastName);
    setBusinessName(c.businessName || '');
    setAddress(c.address);
    setBarangay(c.barangay || '');
    setContactNumber(c.contactNumber || '');
    setEmail(c.email || '');
    setIsSeniorCitizen(c.isSeniorCitizen);
    setIsPwd(c.isPwd);
    setConsumerStatus(c.status);
    setNotes(c.notes || '');
    setFormError('');
    setEditing(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== 'loaded') return;
    setSaving(true);
    setFormError('');
    try {
      await updateConsumer(state.data.id, {
        expectedVersion: state.data.version,
        firstName, lastName,
        middleName, businessName,
        address, barangay,
        contactNumber, email,
        isSeniorCitizen, isPwd,
        status: consumerStatus,
        notes,
      });
      setEditing(false);
      load();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to update.');
    } finally {
      setSaving(false);
    }
  }

  async function openAssignMeter() {
    setShowAssignMeter(true);
    setAssignError('');
    setSelectedMeterId('');
    setInstalledDate(new Date().toISOString().slice(0, 10));
    setMeterRemarks('');
    try {
      const meters = await getUnassignedMeters();
      setUnassignedMeters(meters);
    } catch {
      setAssignError('Failed to load available meters.');
    }
  }

  async function handleAssignMeter(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setAssigningSaving(true);
    setAssignError('');
    try {
      await assignMeter(id, {
        meterId: selectedMeterId,
        installedDate,
        ...(meterRemarks ? { remarks: meterRemarks } : {}),
      });
      setShowAssignMeter(false);
      load();
    } catch (err) {
      setAssignError(err instanceof BillingApiError ? err.message : 'Failed to assign meter.');
    } finally {
      setAssigningSaving(false);
    }
  }

  if (state.status === 'loading') return <div className="bill-page"><BillingSubNav /><p>Loading...</p></div>;
  if (state.status === 'error') return <div className="bill-page"><BillingSubNav /><div className="bill-error">{state.message}</div></div>;

  const c = state.data;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Link to="/billing/consumers" className="bill-back-link">&larr; Back to Consumers</Link>
        <Link to={`/billing/print/soa?consumerId=${c.id}`} className="bill-btn bill-btn--secondary" style={{ fontSize: '12px', padding: '6px 14px' }}>Print SOA</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{c.lastName}, {c.firstName}{c.middleName ? ` ${c.middleName}` : ''}</h1>
        <span className={`bill-badge bill-badge--${c.status}`}>{c.status}</span>
      </div>

      {!editing && (
        <>
          <dl className="bill-detail-grid">
            <div className="bill-detail-field"><dt>Account Number</dt><dd>{c.accountNumber}</dd></div>
            <div className="bill-detail-field"><dt>Type</dt><dd><span className={`bill-badge bill-badge--${c.consumerType}`}>{c.consumerType}</span></dd></div>
            <div className="bill-detail-field"><dt>Address</dt><dd>{c.address}</dd></div>
            <div className="bill-detail-field"><dt>Barangay</dt><dd>{c.barangay || '--'}</dd></div>
            <div className="bill-detail-field"><dt>Municipality</dt><dd>{c.municipality || '--'}</dd></div>
            <div className="bill-detail-field"><dt>Province</dt><dd>{c.province || '--'}</dd></div>
            <div className="bill-detail-field"><dt>Contact</dt><dd>{c.contactNumber || '--'}</dd></div>
            <div className="bill-detail-field"><dt>Email</dt><dd>{c.email || '--'}</dd></div>
            <div className="bill-detail-field"><dt>Senior Citizen</dt><dd>{c.isSeniorCitizen ? 'Yes' : 'No'}</dd></div>
            <div className="bill-detail-field"><dt>PWD</dt><dd>{c.isPwd ? 'Yes' : 'No'}</dd></div>
            <div className="bill-detail-field"><dt>Connection Date</dt><dd>{c.connectionDate ? new Date(c.connectionDate).toLocaleDateString() : '--'}</dd></div>
            {c.businessName && <div className="bill-detail-field"><dt>Business Name</dt><dd>{c.businessName}</dd></div>}
            <div className="bill-detail-field"><dt>Notes</dt><dd>{c.notes || '--'}</dd></div>
          </dl>
          <div style={{ display: 'flex', gap: '8px' }}>
            {hasPermission('billing.consumer.manage') && (
              <button type="button" className="bill-btn bill-btn--primary" onClick={() => startEdit(c)}>Edit Consumer</button>
            )}
            {hasPermission('billing.meter.manage') && (
              <button type="button" className="bill-btn bill-btn--success" onClick={openAssignMeter}>Assign Meter</button>
            )}
          </div>
        </>
      )}

      {editing && (
        <form className="bill-form" onSubmit={handleUpdate}>
          {formError && <div className="bill-error">{formError}</div>}
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
              <label>Status</label>
              <select value={consumerStatus} onChange={(e) => setConsumerStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disconnected">Disconnected</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Address *</label>
              <input required value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Barangay</label>
              <input value={barangay} onChange={(e) => setBarangay(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Contact Number</label>
              <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
            </div>
          </div>
          <div className="bill-field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '8px' }}>
            <div className="bill-checkbox-row">
              <input type="checkbox" id="editSenior" checked={isSeniorCitizen} onChange={(e) => setIsSeniorCitizen(e.target.checked)} />
              <label htmlFor="editSenior">Senior Citizen</label>
            </div>
            <div className="bill-checkbox-row">
              <input type="checkbox" id="editPwd" checked={isPwd} onChange={(e) => setIsPwd(e.target.checked)} />
              <label htmlFor="editPwd">PWD</label>
            </div>
          </div>
          <div className="bill-field">
            <label>Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Update Consumer'}
            </button>
          </div>
        </form>
      )}

      {showAssignMeter && (
        <form className="bill-form" onSubmit={handleAssignMeter} style={{ marginTop: '16px' }}>
          <h3 className="bill-section-title" style={{ marginTop: 0 }}>Assign Meter</h3>
          {assignError && <div className="bill-error">{assignError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="bill-field">
              <label>Meter *</label>
              <select required value={selectedMeterId} onChange={(e) => setSelectedMeterId(e.target.value)}>
                <option value="">Select a meter...</option>
                {unassignedMeters.map((m) => (
                  <option key={m.id} value={m.id}>{m.serialNumber}{m.brand ? ` (${m.brand})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="bill-field">
              <label>Install Date *</label>
              <input type="date" required value={installedDate} onChange={(e) => setInstalledDate(e.target.value)} />
            </div>
            <div className="bill-field">
              <label>Remarks</label>
              <input value={meterRemarks} onChange={(e) => setMeterRemarks(e.target.value)} />
            </div>
          </div>
          <div className="bill-form-actions">
            <button type="button" className="bill-btn" onClick={() => setShowAssignMeter(false)}>Cancel</button>
            <button type="submit" className="bill-btn bill-btn--success" disabled={assigningSaving}>
              {assigningSaving ? 'Assigning...' : 'Assign Meter'}
            </button>
          </div>
        </form>
      )}

      <h3 className="bill-section-title">Meter History</h3>
      {c.consumerMeters.length === 0 ? (
        <div className="bill-empty">No meter assignments yet.</div>
      ) : (
        <table className="bill-table">
          <thead>
            <tr>
              <th>Serial Number</th>
              <th>Brand</th>
              <th>Size</th>
              <th>Installed</th>
              <th>Removed</th>
              <th>Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {c.consumerMeters.map((cm) => (
              <tr key={cm.id}>
                <td>
                  <Link to={`/billing/meters/${cm.meterId}`} className="bill-table__link">
                    {cm.meter.serialNumber}
                  </Link>
                </td>
                <td>{cm.meter.brand || '--'}</td>
                <td>{cm.meter.size ? cm.meter.size.replace(/_/g, ' ') : '--'}</td>
                <td>{new Date(cm.installedDate).toLocaleDateString()}</td>
                <td>{cm.removedDate ? new Date(cm.removedDate).toLocaleDateString() : '--'}</td>
                <td>
                  {cm.isCurrent
                    ? <span className="bill-badge bill-badge--active">Current</span>
                    : <span className="bill-badge bill-badge--inactive">Previous</span>
                  }
                </td>
                <td>{cm.installationRemarks || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
