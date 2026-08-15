import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { getTransfers, createTransfer, getAssetRegister, getUsers, getLocations } from '../api';
import type { AssetTransfer, AssetTransferStatus } from '../types';
import { TRANSFER_STATUS_LABELS } from '../types';

import AssetSubNav from './AssetSubNav';
import '../asset.css';

interface RegisterOption {
  id: string;
  propertyNumber: string;
  description: string;
}
interface UserOption {
  id: string;
  username: string;
}
interface LocationOption {
  id: string;
  name: string;
}

export default function AssetTransfersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [properties, setProperties] = useState<RegisterOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const [propertyRecordId, setPropertyRecordId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  function loadTransfers() {
    setLoading(true);
    setError('');
    getTransfers(statusFilter || undefined)
      .then(setTransfers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTransfers();
  }, [statusFilter]);

  function openForm() {
    setShowForm(true);
    setFormError('');
    setPropertyRecordId('');
    setToUserId('');
    setToLocationId('');
    setReason('');
    setTransferDate(new Date().toISOString().slice(0, 10));
    getAssetRegister('isDisposed=false')
      .then((items) =>
        setProperties(
          items.map((r) => ({
            id: r.id,
            propertyNumber: r.propertyNumber,
            description: r.description,
          })),
        ),
      )
      .catch(() => {});
    getUsers()
      .then(setUsers)
      .catch(() => {});
    getLocations()
      .then(setLocations)
      .catch(() => {});
  }

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!propertyRecordId || !toUserId || !transferDate) {
      setFormError('Property, recipient, and date are required.');
      return;
    }
    setCreating(true);
    setFormError('');
    try {
      const transfer = await createTransfer({
        propertyRecordId,
        toUserId,
        ...(toLocationId ? { toLocationId } : {}),
        transferDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setShowForm(false);
      navigate(`/assets/transfers/${transfer.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create transfer');
    } finally {
      setCreating(false);
    }
  }

  function setFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set('status', value);
      } else {
        next.delete('status');
      }
      return next;
    });
  }

  return (
    <div className="am-page">
      <AssetSubNav />
      <div className="am-page__header">
        <h1>Asset Transfers</h1>
        <div className="am-page__actions">
          <button
            type="button"
            className="am-btn am-btn--primary"
            onClick={() => (showForm ? setShowForm(false) : openForm())}
          >
            {showForm ? 'Cancel' : '+ New Transfer'}
          </button>
        </div>
      </div>

      {error && <div className="am-error">{error}</div>}

      {showForm && (
        <div className="am-inline-form">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>New Transfer</h2>
          {formError && <div className="am-error">{formError}</div>}
          <form onSubmit={handleCreate}>
            <div className="am-form__grid">
              <div className="am-form__field">
                <label className="am-form__label">Property Record *</label>
                <select
                  className="am-select"
                  value={propertyRecordId}
                  onChange={(e) => setPropertyRecordId(e.target.value)}
                  style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
                >
                  <option value="">Select property...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.propertyNumber} — {p.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Transfer To (User) *</label>
                <select
                  className="am-select"
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
                >
                  <option value="">Select user...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              </div>
              <div className="am-form__field">
                <label className="am-form__label">To Location</label>
                <select
                  className="am-select"
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
                >
                  <option value="">Select location...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="am-form__field">
                <label className="am-form__label">Transfer Date *</label>
                <input
                  className="am-input"
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                />
              </div>
              <div className="am-form__field am-form__field--full">
                <label className="am-form__label">Reason</label>
                <textarea
                  className="am-textarea"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for transfer..."
                />
              </div>
            </div>
            <div className="am-form__actions">
              <button type="submit" className="am-btn am-btn--primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Transfer'}
              </button>
              <button
                type="button"
                className="am-btn"
                onClick={() => setShowForm(false)}
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="am-filters">
        <select
          className="am-select"
          value={statusFilter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="am-loading">Loading...</div>
      ) : transfers.length === 0 ? (
        <div className="am-empty">No transfers found.</div>
      ) : (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>Property</th>
                <th>From</th>
                <th>To</th>
                <th>Date</th>
                <th>Status</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/assets/transfers/${t.id}`)}>
                  <td>
                    <Link
                      to={`/assets/transfers/${t.id}`}
                      className="am-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.transferNumber}
                    </Link>
                  </td>
                  <td>
                    {t.propertyRecord.propertyNumber} — {t.propertyRecord.description}
                  </td>
                  <td>{t.fromUser?.username ?? '—'}</td>
                  <td>{t.toUser.username}</td>
                  <td>{new Date(t.transferDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`am-badge am-badge--status-${t.status}`}>
                      {TRANSFER_STATUS_LABELS[t.status as AssetTransferStatus] ?? t.status}
                    </span>
                  </td>
                  <td>{t.approver?.username ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
