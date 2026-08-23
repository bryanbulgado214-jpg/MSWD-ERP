import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { RoleDetail, PermissionItem } from '../api';
import { getRole, listPermissions, addPermissionToRole, removePermissionFromRole } from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

// Friendly module names + a nav-like ordering; unknown modules fall to the end.
const MODULE_LABELS: Record<string, string> = {
  core: 'Administration',
  billing: 'Billing & Collection',
  accounting: 'Accounting',
  budgeting: 'Budgeting',
  procurement: 'Procurement',
  inventory: 'Inventory',
  hr: 'HR & Payroll',
  workorder: 'Work Orders',
  complaint: 'Complaints',
  asset: 'Assets',
  reports: 'Reports',
};
const MODULE_ORDER = Object.keys(MODULE_LABELS);
const moduleLabel = (m: string) => MODULE_LABELS[m] ?? m.charAt(0).toUpperCase() + m.slice(1);
const moduleRank = (m: string) => {
  const i = MODULE_ORDER.indexOf(m);
  return i === -1 ? MODULE_ORDER.length : i;
};

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [allPerms, setAllPerms] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  // permId → assignmentId for the permissions this role currently holds.
  const assigned = new Map(role.permissions.map((p) => [p.id, p.assignmentId]));

  // Every permission in the system, grouped by module (the full checklist).
  const permsByModule: Record<string, PermissionItem[]> = {};
  for (const p of allPerms) (permsByModule[p.module] ??= []).push(p);
  for (const m of Object.keys(permsByModule)) {
    permsByModule[m]!.sort((a, b) => a.code.localeCompare(b.code));
  }
  const orderedModules = Object.keys(permsByModule).sort(
    (a, b) => moduleRank(a) - moduleRank(b) || a.localeCompare(b),
  );

  async function toggle(perm: PermissionItem, checked: boolean) {
    if (!id) return;
    setPending((prev) => new Set(prev).add(perm.id));
    setError('');
    try {
      if (checked) {
        await addPermissionToRole(id, perm.id);
      } else {
        const assignmentId = role?.permissions.find((p) => p.id === perm.id)?.assignmentId;
        if (assignmentId) await removePermissionFromRole(id, assignmentId);
      }
      setRole(await getRole(id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update permission.');
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(perm.id);
        return next;
      });
    }
  }

  function toggleCollapse(mod: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
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
          <h2 className="admin-section__title">
            Permissions ({role.permissions.length} of {allPerms.length})
          </h2>
          <span className="admin-perm-hint">Check to grant access · uncheck to revoke</span>
        </div>

        {orderedModules.map((mod) => {
          const perms = permsByModule[mod]!;
          const grantedCount = perms.filter((p) => assigned.has(p.id)).length;
          const isCollapsed = collapsed.has(mod);
          return (
            <div key={mod} className="admin-perm-group">
              <button
                type="button"
                className="admin-perm-group__header"
                onClick={() => toggleCollapse(mod)}
              >
                <span className="admin-perm-group__label">
                  <span className="admin-perm-group__caret">{isCollapsed ? '▸' : '▾'}</span>
                  {moduleLabel(mod)}
                </span>
                <span
                  className={`admin-perm-group__count${grantedCount > 0 ? ' admin-perm-group__count--on' : ''}`}
                >
                  {grantedCount}/{perms.length}
                </span>
              </button>
              {!isCollapsed && (
                <div className="admin-perm-list">
                  {perms.map((p) => {
                    const checked = assigned.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`admin-perm-check${checked ? ' admin-perm-check--on' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={pending.has(p.id)}
                          onChange={(e) => toggle(p, e.target.checked)}
                        />
                        <span className="admin-perm-item__code">{p.code}</span>
                        <span className="admin-perm-item__name">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {allPerms.length === 0 && (
          <div className="admin-empty">No permissions are defined in the system.</div>
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
