import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { UserSummary, RoleSummary } from '../api';
import { listUsers, listRoles, createUser, updateUser, assignRole, revokeRole } from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

export function UserListPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [roleModal, setRoleModal] = useState<{ userId: string; username: string } | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');

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
      await createUser(createForm);
      setShowCreate(false);
      setCreateForm({ username: '', email: '', password: '' });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
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

      {showCreate && (
        <div className="admin-modal-overlay" onClick={() => setShowCreate(false)}>
          <form
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="admin-modal__title">Create User</h2>
            <label className="admin-field">
              <span className="admin-field__label">Username</span>
              <input
                className="admin-input"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                required
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

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
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
                  <button
                    type="button"
                    className={`admin-btn admin-btn--sm ${u.isActive ? 'admin-btn--danger' : 'admin-btn--success'}`}
                    onClick={() => handleToggleActive(u)}
                  >
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
