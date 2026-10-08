import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  createStaff,
  listStaff,
  listStaffLinkOptions,
  removeStaff,
  setStaffStatus,
  updateStaff,
} from '../api';
import { STAFF_STATUS_LABELS, type StaffAvailabilityStatus, type StaffMember } from '../types';
import '../workorders.css';

const STATUS_STYLE: Record<StaffAvailabilityStatus, { bg: string; fg: string }> = {
  available: { bg: '#ecfdf3', fg: '#067647' },
  on_field: { bg: '#eff8ff', fg: '#175cd3' },
  on_leave: { bg: '#fffaeb', fg: '#b54708' },
  unavailable: { bg: '#fef3f2', fg: '#b42318' },
};
const STATUSES: StaffAvailabilityStatus[] = ['available', 'on_field', 'on_leave', 'unavailable'];

type LinkOption = { id: string; name: string; designation: string | null };

export default function StaffAvailabilityPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('workorder.staff.manage');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  // add/edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fDesignation, setFDesignation] = useState('');
  const [fDepartment, setFDepartment] = useState('');
  const [fContact, setFContact] = useState('');
  const [fField, setFField] = useState(false);
  const [fLinkId, setFLinkId] = useState('');
  const [fLinkName, setFLinkName] = useState('');
  const [linkOptions, setLinkOptions] = useState<LinkOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);
  function fetchAll() {
    listStaff()
      .then(setStaff)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }

  async function changeStatus(s: StaffMember, status: StaffAvailabilityStatus) {
    if (status === s.status) return;
    setError('');
    setOk('');
    try {
      const updated = await setStaffStatus(s.id, status);
      setStaff((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
      setOk(`${s.name} → ${STAFF_STATUS_LABELS[status]}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    }
  }

  function openAdd() {
    setEditId(null);
    setFName('');
    setFDesignation('');
    setFDepartment('');
    setFContact('');
    setFField(false);
    setFLinkId('');
    setFLinkName('');
    listStaffLinkOptions()
      .then(setLinkOptions)
      .catch(() => setLinkOptions([]));
    setError('');
    setShowForm(true);
  }
  function openEdit(s: StaffMember) {
    setEditId(s.id);
    setFName(s.name);
    setFDesignation(s.designation ?? '');
    setFDepartment(s.department ?? '');
    setFContact(s.contactNumber ?? '');
    setFField(s.isFieldPersonnel);
    setFLinkId(s.workOrderPersonnelId ?? '');
    setFLinkName(s.workOrderPersonnel?.name ?? '');
    listStaffLinkOptions()
      .then(setLinkOptions)
      .catch(() => setLinkOptions([]));
    setError('');
    setShowForm(true);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await updateStaff(editId, {
          name: fName.trim(),
          designation: fDesignation.trim(),
          department: fDepartment.trim(),
          contactNumber: fContact.trim(),
          isFieldPersonnel: fField,
          workOrderPersonnelId: fField ? fLinkId : '',
        });
      } else {
        await createStaff({
          name: fName.trim(),
          ...(fDesignation.trim() ? { designation: fDesignation.trim() } : {}),
          ...(fDepartment.trim() ? { department: fDepartment.trim() } : {}),
          ...(fContact.trim() ? { contactNumber: fContact.trim() } : {}),
          isFieldPersonnel: fField,
          ...(fField && fLinkId ? { workOrderPersonnelId: fLinkId } : {}),
        });
      }
      setShowForm(false);
      setOk(editId ? 'Staff member updated.' : 'Staff member added.');
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(s: StaffMember) {
    if (!window.confirm(`Deactivate ${s.name}? They will be hidden from the active list.`)) return;
    setError('');
    try {
      await removeStaff(s.id);
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate');
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of staff) if (s.isActive) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [staff]);

  const filtered = staff.filter(
    (s) =>
      (!statusFilter || s.status === statusFilter) &&
      (!q ||
        s.name.toLowerCase().includes(q.toLowerCase()) ||
        (s.department ?? '').toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="wo-page">
      <Link to="/work-orders" className="wo-back">
        <span className="wo-back__arrow" aria-hidden="true">&larr;</span>
        Back to Work Orders
      </Link>
      <div className="wo-page__header">
        <h1>Staff Availability</h1>
        {canManage && (
          <button className="wo-btn wo-btn--primary" onClick={openAdd}>
            + Add Staff
          </button>
        )}
      </div>
      <p style={{ color: '#667085', marginTop: -6 }}>
        {canManage
          ? 'Master list of all staff. Field personnel linked to the crew roster go "On field work" automatically when a work order is dispatched, and back to "Available" when it is completed.'
          : 'Read-only view — only the admin can change a status. Field personnel update automatically when dispatched.'}
      </p>

      {/* Status summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 16px' }}>
        {STATUSES.map((st) => (
          <div
            key={st}
            style={{ border: '1px solid #eaecf0', borderRadius: 10, padding: '8px 16px', minWidth: 120, background: '#fff' }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: STATUS_STYLE[st].fg }}>{counts[st] ?? 0}</div>
            <div style={{ fontSize: 12, color: '#667085' }}>{STAFF_STATUS_LABELS[st]}</div>
          </div>
        ))}
      </div>

      {error && <div className="wo-error">{error}</div>}
      {ok && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #abefc6',
            color: '#067647',
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          ✓ {ok}
        </div>
      )}

      {/* Add / edit form */}
      {showForm && canManage && (
        <form onSubmit={saveForm} className="wo-crew-box" style={{ marginBottom: 16 }}>
          <h3 className="wo-crew-box__title">{editId ? 'Edit staff member' : 'Add staff member'}</h3>
          <div className="wo-form__grid">
            <label className="wo-form__field">
              <span className="wo-form__label">Name *</span>
              <input className="wo-input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </label>
            <label className="wo-form__field">
              <span className="wo-form__label">Designation</span>
              <input className="wo-input" value={fDesignation} onChange={(e) => setFDesignation(e.target.value)} />
            </label>
            <label className="wo-form__field">
              <span className="wo-form__label">Department / Section</span>
              <input className="wo-input" value={fDepartment} onChange={(e) => setFDepartment(e.target.value)} />
            </label>
            <label className="wo-form__field">
              <span className="wo-form__label">Contact number</span>
              <input className="wo-input" value={fContact} onChange={(e) => setFContact(e.target.value)} />
            </label>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
            <input type="checkbox" checked={fField} onChange={(e) => setFField(e.target.checked)} />
            Field personnel (eligible for work-order dispatch)
          </label>
          {fField && (
            <label className="wo-form__field wo-form__field--full">
              <span className="wo-form__label">Linked crew roster entry (for auto-status on dispatch)</span>
              <select className="wo-select" value={fLinkId} onChange={(e) => setFLinkId(e.target.value)}>
                <option value="">— Not linked —</option>
                {fLinkId && fLinkName && !linkOptions.some((o) => o.id === fLinkId) && (
                  <option value={fLinkId}>{fLinkName} (current)</option>
                )}
                {linkOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.designation ? ` — ${o.designation}` : ''}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                Only personnel added under Teams &amp; Personnel appear here. Link one so this
                person&apos;s status flips automatically when they are dispatched.
              </span>
            </label>
          )}
          <div className="wo-form__actions">
            <button type="button" className="wo-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="wo-btn wo-btn--primary" disabled={saving || !fName.trim()}>
              {saving ? 'Saving…' : editId ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          className="wo-input"
          placeholder="Search name / department"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <select
          className="wo-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ maxWidth: 180 }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {STAFF_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </div>

      <div className="wo-table-wrap">
        <table className="wo-table" style={{ width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#667085' }}>
              <th>Name</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Type</th>
              <th>Status</th>
              <th>Linked crew</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const style = STATUS_STYLE[s.status];
              return (
                <tr key={s.id} style={{ borderTop: '1px solid #eef0f3', opacity: s.isActive ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.designation ?? '—'}</td>
                  <td>{s.department ?? '—'}</td>
                  <td>{s.isFieldPersonnel ? 'Field' : 'Office'}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '2px 10px',
                        borderRadius: 12,
                        background: style.bg,
                        color: style.fg,
                      }}
                    >
                      {STAFF_STATUS_LABELS[s.status]}
                    </span>
                    {s.statusNote ? (
                      <div style={{ fontSize: 11, color: '#667085' }}>{s.statusNote}</div>
                    ) : null}
                    {canManage && (
                      <select
                        className="wo-select"
                        value={s.status}
                        onChange={(e) => changeStatus(s, e.target.value as StaffAvailabilityStatus)}
                        style={{ fontSize: 12, padding: '2px 6px', marginTop: 4, maxWidth: 160 }}
                        title="Change status"
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {STAFF_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{s.workOrderPersonnel?.name ?? (s.isFieldPersonnel ? '— (not linked)' : '—')}</td>
                  {canManage && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="wo-btn wo-btn--sm" onClick={() => openEdit(s)}>
                        Edit
                      </button>{' '}
                      {s.isActive && (
                        <button className="wo-btn wo-btn--sm" onClick={() => deactivate(s)}>
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ padding: 14, color: '#667085' }}>
                  No staff to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
