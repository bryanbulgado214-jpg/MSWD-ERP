import { useEffect, useState } from 'react';

import type { UserSummary, RoleSummary } from '../api';
import { listUsers, listRoles, createUser, updateUser, assignRole, revokeRole } from '../api';

import { AdminSubNav } from './AdminSubNav';
import { UserAccessModal } from './UserAccessModal';
import './admin.css';

export function UserListPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [creating, setCreating] = useState(false);
  const [roleModal, setRoleModal] = useState<{ userId: string; username: string } | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [accessModal, setAccessModal] = useState<{ userId: string; username: string } | null>(null);
  const [editUser, setEditUser] = useState<UserSummary | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', password: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [flash, setFlash] = useState('');

  function load() {
    setLoading(true);
    Promise.all([listUsers(), listRoles()])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = (await createUser(createForm)) as { id: string; username: string };
      setShowCreate(false);
      setCreateForm({ username: '', fullName: '', email: '', password: '' });
      load();
      // Immediately let the admin choose this person's access.
      setAccessModal({ userId: created.id, username: created.username });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(u: UserSummary) {
    setEditUser(u);
    setEditForm({ fullName: u.fullName ?? '', password: '' });
    setError('');
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSavingEdit(true);
    try {
      await updateUser(editUser.id, {
        fullName: editForm.fullName,
        ...(editForm.password ? { password: editForm.password } : {}),
      });
      setEditUser(null);
      setFlash(`Saved changes for ${editUser.username}.`);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(u: UserSummary) {
    try {
      await updateUser(u.id, { isActive: !u.isActive });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  async function handleAssignRole() {
    if (!roleModal || !selectedRoleId) return;
    try {
      await assignRole(roleModal.userId, selectedRoleId);
      setRoleModal(null);
      setSelectedRoleId('');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
    }
  }

  async function handleRevokeRole(userId: string, assignmentId: string) {
    try {
      await revokeRole(userId, assignmentId);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke role');
    }
  }

  if (loading)
    return (
      <div className="admin-page">
        <div className="admin-loading">Loading users...</div>
      </div>
    );

  return (
    <div className="admin-page">
      <AdminSubNav />
      <div className="admin-header">
        <h1 className="admin-title">User Management</h1>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate(true)}
        >
          + New User
        </button>
      </div>

      {error && (
        <div className="admin-error">
          {error}{' '}
          <button type="button" onClick={() => setError('')}>
            dismiss
          </button>
        </div>
      )}

      {flash && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #6ce9a6',
            color: '#027a48',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {flash}
        </div>
      )}

      {showCreate && (
        <div className="admin-modal-overlay" onClick={() => setShowCreate(false)}>
          <form
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="admin-modal__title">Create User</h2>
            <label className="admin-field">
              <span className="admin-field__label">Username (login)</span>
              <input
                className="admin-input"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Full name</span>
              <input
                className="admin-input"
                value={createForm.fullName}
                onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="e.g. Maria Santos"
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Email</span>
              <input
                className="admin-input"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Password</span>
              <input
                className="admin-input"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
              />
            </label>
            <div className="admin-modal__actions">
              <button type="button" className="admin-btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {roleModal && (
        <div className="admin-modal-overlay" onClick={() => setRoleModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal__title">Assign Role to {roleModal.username}</h2>
            <select
              className="admin-input"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">Select a role...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
            <div className="admin-modal__actions">
              <button type="button" className="admin-btn" onClick={() => setRoleModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={!selectedRoleId}
                onClick={handleAssignRole}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="admin-modal-overlay" onClick={() => setEditUser(null)}>
          <form
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleEditSave}
          >
            <h2 className="admin-modal__title">
              Edit <span style={{ color: '#175cd3' }}>{editUser.username}</span>
            </h2>
            <p style={{ margin: '0 0 12px', color: '#667085', fontSize: 12 }}>
              The username stays the same for login; the full name is what shows in the app.
            </p>
            <label className="admin-field">
              <span className="admin-field__label">Full name</span>
              <input
                className="admin-input"
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="e.g. Maria Santos"
                autoFocus
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Reset password (optional)</span>
              <input
                className="admin-input"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Leave blank to keep the current password"
                minLength={8}
              />
            </label>
            <div className="admin-modal__actions">
              <button type="button" className="admin-btn" onClick={() => setEditUser(null)}>
                Cancel
              </button>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="admin-table__user">{u.username}</td>
                <td>{u.fullName || <span style={{ color: '#98a2b3' }}>—</span>}</td>
                <td>{u.email}</td>
                <td>
                  <span
                    className={`admin-badge ${u.isActive ? 'admin-badge--active' : 'admin-badge--inactive'}`}
                  >
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="admin-role-tags">
                    {u.roles.map((r) => (
                      <span key={r.assignmentId} className="admin-role-tag">
                        {r.code}
                        <button
                          type="button"
                          className="admin-role-tag__remove"
                          title="Remove role"
                          onClick={() => handleRevokeRole(u.id, r.assignmentId)}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="admin-role-tag admin-role-tag--add"
                      onClick={() => setRoleModal({ userId: u.id, username: u.username })}
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="admin-table__date">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      onClick={() => startEdit(u)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      onClick={() => setAccessModal({ userId: u.id, username: u.username })}
                    >
                      Access
                    </button>
                    <button
                      type="button"
                      className={`admin-btn admin-btn--sm ${u.isActive ? 'admin-btn--danger' : 'admin-btn--success'}`}
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {accessModal && (
        <UserAccessModal
          userId={accessModal.userId}
          username={accessModal.username}
          onClose={() => setAccessModal(null)}
          onSaved={(count) => {
            setAccessModal(null);
            setFlash(`Saved access for ${accessModal.username} — ${count} feature(s) granted.`);
          }}
        />
      )}
    </div>
  );
}
