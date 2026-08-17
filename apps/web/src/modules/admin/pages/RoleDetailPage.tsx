import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { RoleDetail, PermissionItem } from '../api';
import { getRole, listPermissions, addPermissionToRole, removePermissionFromRole } from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [allPerms, setAllPerms] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddPerm, setShowAddPerm] = useState(false);
  const [selectedPermId, setSelectedPermId] = useState('');
  const [filterModule, setFilterModule] = useState('');

  function load() {
    if (!id) return;
    setLoading(true);
    Promise.all([getRole(id), listPermissions()])
      .then(([r, p]) => {
        setRole(r);
        setAllPerms(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (loading)
    return (
      <div className="admin-page">
        <div className="admin-loading">Loading role...</div>
      </div>
    );
  if (!role)
    return (
      <div className="admin-page">
        <div className="admin-error">Role not found.</div>
      </div>
    );

  const assignedPermIds = new Set(role.permissions.map((p) => p.id));
  const availablePerms = allPerms.filter((p) => !assignedPermIds.has(p.id));
  const modules = [...new Set(availablePerms.map((p) => p.module))].sort();
  const filteredPerms = filterModule
    ? availablePerms.filter((p) => p.module === filterModule)
    : availablePerms;

  const permsByModule: Record<string, typeof role.permissions> = {};
  for (const p of role.permissions) {
    (permsByModule[p.module] ??= []).push(p);
  }

  async function handleAddPerm() {
    if (!id || !selectedPermId) return;
    try {
      await addPermissionToRole(id, selectedPermId);
      setShowAddPerm(false);
      setSelectedPermId('');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleRemovePerm(assignmentId: string) {
    if (!id) return;
    try {
      await removePermissionFromRole(id, assignmentId);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div className="admin-page">
      <AdminSubNav />
      <div className="admin-header">
        <div>
          <Link to="/admin/roles" className="admin-back">
            &larr; Roles
          </Link>
          <h1 className="admin-title">
            {role.name} <span className="admin-title__code">({role.code})</span>
          </h1>
          {role.description && <p className="admin-subtitle">{role.description}</p>}
        </div>
      </div>

      {error && (
        <div className="admin-error">
          {error}{' '}
          <button type="button" onClick={() => setError('')}>
            dismiss
          </button>
        </div>
      )}

      <div className="admin-section">
        <div className="admin-section__header">
          <h2 className="admin-section__title">Permissions ({role.permissions.length})</h2>
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--sm"
            onClick={() => setShowAddPerm(true)}
          >
            + Add Permission
          </button>
        </div>

        {showAddPerm && (
          <div className="admin-modal-overlay" onClick={() => setShowAddPerm(false)}>
            <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="admin-modal__title">Add Permission</h2>
              <div className="admin-field" style={{ marginBottom: 8 }}>
                <span className="admin-field__label">Filter by module</span>
                <select
                  className="admin-input"
                  value={filterModule}
                  onChange={(e) => {
                    setFilterModule(e.target.value);
                    setSelectedPermId('');
                  }}
                >
                  <option value="">All modules</option>
                  {modules.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <span className="admin-field__label">Permission</span>
                <select
                  className="admin-input"
                  value={selectedPermId}
                  onChange={(e) => setSelectedPermId(e.target.value)}
                >
                  <option value="">Select...</option>
                  {filteredPerms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-modal__actions">
                <button type="button" className="admin-btn" onClick={() => setShowAddPerm(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={!selectedPermId}
                  onClick={handleAddPerm}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {Object.keys(permsByModule)
          .sort()
          .map((mod) => (
            <div key={mod} className="admin-perm-group">
              <h3 className="admin-perm-group__title">{mod}</h3>
              <div className="admin-perm-list">
                {permsByModule[mod]?.map((p) => (
                  <div key={p.assignmentId} className="admin-perm-item">
                    <div>
                      <span className="admin-perm-item__code">{p.code}</span>
                      <span className="admin-perm-item__name">{p.name}</span>
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      onClick={() => handleRemovePerm(p.assignmentId)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {role.permissions.length === 0 && (
          <div className="admin-empty">No permissions assigned to this role.</div>
        )}
      </div>

      <div className="admin-section">
        <h2 className="admin-section__title">Users with this Role ({role.users.length})</h2>
        {role.users.length > 0 ? (
          <div className="admin-user-chips">
            {role.users.map((u) => (
              <span key={u.assignmentId} className="admin-user-chip">
                {u.username} <span className="admin-user-chip__email">({u.email})</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="admin-empty">No users have this role.</div>
        )}
      </div>
    </div>
  );
}
