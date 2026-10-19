import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getCcf, updateCcf } from '../api';
import {
  CCF_CATEGORY_LABELS,
  CCF_STATUS_LABELS,
  WO_STATUS_LABELS,
  type Ccf,
  type CcfCategory,
  type CcfStatus,
} from '../types';
import '../workorders.css';
import { ccfStatusStyle, formatReceived } from './CcfListPage';

const CATEGORIES = Object.keys(CCF_CATEGORY_LABELS) as CcfCategory[];
const STATUSES = Object.keys(CCF_STATUS_LABELS) as CcfStatus[];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CcfDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ccf, setCcf] = useState<Ccf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [seriesNo, setSeriesNo] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [category, setCategory] = useState<CcfCategory>('billing');
  const [location, setLocation] = useState('');
  const [nature, setNature] = useState('');
  const [requestedAction, setRequestedAction] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [status, setStatus] = useState<CcfStatus>('pending');
  const [targetResolutionDate, setTargetResolutionDate] = useState('');
  const [resolvedAt, setResolvedAt] = useState('');
  const [remarks, setRemarks] = useState('');

  function hydrate(c: Ccf) {
    setCcf(c);
    setSeriesNo(c.referenceNumber);
    setReceivedAt(toLocalInput(c.receivedAt));
    setCustomerName(c.customerName);
    setAccountNumber(c.accountNumber ?? '');
    setCategory(c.category);
    setLocation(c.location ?? '');
    setNature(c.nature);
    setRequestedAction(c.requestedAction ?? '');
    setActionTaken(c.actionTaken ?? '');
    setStatus(c.status);
    setTargetResolutionDate(c.targetResolutionDate ? c.targetResolutionDate.slice(0, 10) : '');
    setResolvedAt(c.resolvedAt ? toLocalInput(c.resolvedAt) : '');
    setRemarks(c.remarks ?? '');
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCcf(id)
      .then(hydrate)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const resolvedShown = status === 'resolved' || status === 'closed';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ccf || saving) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCcf(ccf.id, {
        expectedVersion: ccf.version,
        referenceNumber: seriesNo.trim(),
        receivedAt: new Date(receivedAt).toISOString(),
        customerName: customerName.trim(),
        accountNumber: accountNumber.trim(),
        category,
        nature: nature.trim(),
        location: location.trim(),
        requestedAction: requestedAction.trim(),
        actionTaken: actionTaken.trim(),
        status,
        ...(targetResolutionDate ? { targetResolutionDate } : {}),
        ...(resolvedShown && resolvedAt ? { resolvedAt: new Date(resolvedAt).toISOString() } : {}),
        remarks: remarks.trim(),
      });
      hydrate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="wo-page">Loading…</div>;
  if (!ccf) return <div className="wo-page">{error || 'Not found.'}</div>;

  return (
    <div className="wo-page">
      <div className="wo-page__header">
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {ccf.referenceNumber}{' '}
            <span style={ccfStatusStyle(ccf.status)}>{CCF_STATUS_LABELS[ccf.status]}</span>
          </h1>
          <div style={{ fontSize: 13, color: '#667085' }}>
            Received {formatReceived(ccf.receivedAt)} ·{' '}
            {ccf.isOpen ? (
              <strong style={{ color: ccf.overdue ? '#b42318' : '#344054' }}>
                {ccf.daysOpen} day{ccf.daysOpen === 1 ? '' : 's'} open{ccf.overdue ? ' · OVERDUE' : ''}
              </strong>
            ) : (
              <span>resolved in {ccf.daysOpen} day{ccf.daysOpen === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/work-orders/ccf/${ccf.id}/print`} className="wo-btn wo-btn--nav">
            🖨 Print
          </Link>
          <Link to="/work-orders/ccf" className="wo-btn wo-btn--nav">
            &larr; Back to CCF list
          </Link>
        </div>
      </div>

      {error && <div className="wo-error">{error}</div>}

      <form onSubmit={handleSave} className="wo-form">
        <div className="wo-form__grid">
          <div className="wo-form__field">
            <label className="wo-form__label">Series No.</label>
            <input
              type="text"
              className="wo-input"
              value={seriesNo}
              onChange={(e) => setSeriesNo(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Date &amp; Time Received</label>
            <input
              type="datetime-local"
              className="wo-input"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Category</label>
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
            <label className="wo-form__label">Customer Name</label>
            <input
              type="text"
              className="wo-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={200}
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
            <label className="wo-form__label">Nature of Complaint/Concern</label>
            <textarea
              className="wo-textarea"
              value={nature}
              onChange={(e) => setNature(e.target.value)}
              rows={3}
            />
          </div>
          <div className="wo-form__field wo-form__field--full">
            <label className="wo-form__label">Requested Action</label>
            <textarea
              className="wo-textarea"
              value={requestedAction}
              onChange={(e) => setRequestedAction(e.target.value)}
              rows={2}
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Status</label>
            <select
              className="wo-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as CcfStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CCF_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="wo-form__field wo-form__field--full">
            <label className="wo-form__label">Action Taken</label>
            <textarea
              className="wo-textarea"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              rows={2}
              placeholder="Measures undertaken"
            />
          </div>
          <div className="wo-form__field">
            <label className="wo-form__label">Target Resolution Date</label>
            <input
              type="date"
              className="wo-input"
              value={targetResolutionDate}
              onChange={(e) => setTargetResolutionDate(e.target.value)}
            />
          </div>
          {resolvedShown && (
            <div className="wo-form__field">
              <label className="wo-form__label">Actual Resolution Date</label>
              <input
                type="datetime-local"
                className="wo-input"
                value={resolvedAt}
                onChange={(e) => setResolvedAt(e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#98a2b3' }}>
                Left blank, it is stamped when you save as Resolved/Closed.
              </span>
            </div>
          )}
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
            Close
          </button>
          <button type="submit" className="wo-btn wo-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Linked work orders */}
      {ccf.workOrders && ccf.workOrders.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--mswd-navy)' }}>
            Linked Work Orders ({ccf.workOrders.length})
          </h3>
          <div className="wo-table-wrap">
            <table className="wo-table wo-table--compact">
              <thead>
                <tr>
                  <th>WO No.</th>
                  <th>Title</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ccf.workOrders.map((wo) => (
                  <tr key={wo.id}>
                    <td>
                      <Link to={`/work-orders/${wo.id}`} className="wo-table__link">
                        {wo.woNumber}
                      </Link>
                    </td>
                    <td>{wo.title}</td>
                    <td>{WO_STATUS_LABELS[wo.status] ?? wo.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
