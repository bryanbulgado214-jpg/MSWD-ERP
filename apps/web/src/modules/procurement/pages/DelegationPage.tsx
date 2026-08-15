import { useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import type { Delegation, LookupDepartment, LookupPermission, LookupUser } from '../api';
import {
  createDelegation,
  listDelegations,
  listLookupDepartments,
  listLookupPermissions,
  listLookupUsers,
  ProcurementApiError,
  revokeDelegation,
} from '../api';

import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Delegation[] };

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  revoked: 'Revoked',
  expired: 'Expired',
};

function isExpired(d: Delegation): boolean {
  return d.status === 'active' && new Date(d.expirationDate) < new Date(new Date().toDateString());
}

export function DelegationPage() {
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission('procurement.delegation.manage');

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [users, setUsers] = useState<LookupUser[]>([]);
  const [permissions, setPermissions] = useState<LookupPermission[]>([]);
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [delegateUserId, setDelegateUserId] = useState('');
  const [permissionCode, setPermissionCode] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [amountLimit, setAmountLimit] = useState('');
  const [scopeDepartmentId, setScopeDepartmentId] = useState('');
  const [remarks, setRemarks] = useState('');

  function loadDelegations() {
    setState({ status: 'loading' });
    listDelegations({ ...(statusFilter ? { status: statusFilter } : {}) })
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({
          status: 'error',
          message: e instanceof ProcurementApiError ? e.message : 'Failed to load delegations.',
        }),
      );
  }

  useEffect(loadDelegations, [statusFilter]);

  useEffect(() => {
    if (!showForm) return;
    Promise.all([listLookupUsers(), listLookupPermissions(), listLookupDepartments()])
      .then(([u, p, d]) => {
        setUsers(u);
        setPermissions(p);
        setDepartments(d);
      })
      .catch(() => {});
  }, [showForm]);

  function resetForm() {
    setDelegateUserId('');
    setPermissionCode('');
    setEffectiveDate('');
    setExpirationDate('');
    setAmountLimit('');
    setScopeDepartmentId('');
    setRemarks('');
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!delegateUserId || !permissionCode || !effectiveDate || !expirationDate) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createDelegation({
        delegateUserId,
        permissionCode,
        effectiveDate,
        expirationDate,
        ...(amountLimit ? { amountLimit: parseFloat(amountLimit) } : {}),
        ...(scopeDepartmentId ? { scopeDepartmentId } : {}),
        ...(remarks ? { remarks } : {}),
      });
      resetForm();
      setShowForm(false);
      loadDelegations();
    } catch (err) {
      setFormError(
        err instanceof ProcurementApiError ? err.message : 'Failed to create delegation.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(d: Delegation) {
    const reason = window.prompt('Reason for revoking (optional):');
    if (reason === null) return;
    try {
      await revokeDelegation(d.id, d.version, reason || undefined);
      loadDelegations();
    } catch (err) {
      alert(err instanceof ProcurementApiError ? err.message : 'Failed to revoke.');
    }
  }

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Delegation Authorities</h1>

      <div className="pr-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
        {canManage && (
          <button
            className="pr-btn pr-btn--primary"
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) resetForm();
            }}
          >
            {showForm ? 'Cancel' : 'New Delegation'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="pr-form" style={{ marginBottom: 24 }}>
          {formError && <div className="pr-error">{formError}</div>}

          <div className="pr-form-grid">
            <div>
              <label className="pr-form-label">Delegate To *</label>
              <select
                value={delegateUserId}
                onChange={(e) => setDelegateUserId(e.target.value)}
                required
              >
                <option value="">Select user...</option>
                {users
                  .filter((u) => u.id !== user?.sub)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="pr-form-label">Permission *</label>
              <select
                value={permissionCode}
                onChange={(e) => setPermissionCode(e.target.value)}
                required
              >
                <option value="">Select permission...</option>
                {permissions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="pr-form-label">Effective Date *</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="pr-form-label">Expiration Date *</label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="pr-form-label">Amount Limit (optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountLimit}
                onChange={(e) => setAmountLimit(e.target.value)}
                placeholder="No limit"
              />
            </div>

            <div>
              <label className="pr-form-label">Scope Department (optional)</label>
              <select
                value={scopeDepartmentId}
                onChange={(e) => setScopeDepartmentId(e.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="pr-form-label">Remarks (optional)</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="submit" className="pr-btn pr-btn--primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Delegation'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <div className="pr-empty">Loading delegations...</div>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No delegations found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="pr-table">
            <thead>
              <tr>
                <th>Delegator</th>
                <th>Delegate</th>
                <th>Permission</th>
                <th>Effective</th>
                <th>Expires</th>
                <th>Amount Limit</th>
                <th>Dept Scope</th>
                <th>Status</th>
                {canManage && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {state.data.map((d) => {
                const expired = isExpired(d);
                const displayStatus = expired ? 'Expired' : (STATUS_LABELS[d.status] ?? d.status);
                const badgeClass = expired
                  ? 'pr-badge--cancelled'
                  : d.status === 'active'
                    ? 'pr-badge--active'
                    : 'pr-badge--rejected';
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.delegator.username}</td>
                    <td style={{ fontWeight: 600 }}>{d.delegate.username}</td>
                    <td style={{ fontSize: 12 }}>{d.permissionCode}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(d.effectiveDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(d.expirationDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {d.amountLimit
                        ? `₱${parseFloat(d.amountLimit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{d.scopeDepartment?.name ?? 'All'}</td>
                    <td>
                      <span className={`pr-badge ${badgeClass}`}>{displayStatus}</span>
                    </td>
                    {canManage && (
                      <td>
                        {d.status === 'active' && !expired && (
                          <button
                            className="pr-btn pr-btn--danger"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => handleRevoke(d)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
