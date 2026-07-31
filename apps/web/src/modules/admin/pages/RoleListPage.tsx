import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { RoleSummary } from '../api';
import { listRoles } from '../api';
import './admin.css';

export function RoleListPage() {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRoles()
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-page"><div className="admin-loading">Loading roles...</div></div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1 className="admin-title">Role Management</h1>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th>Users</th>
              <th>Permissions</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td className="admin-table__code">{r.code}</td>
                <td className="admin-table__user">{r.name}</td>
                <td className="admin-table__desc">{r.description ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>{r._count.userRoles}</td>
                <td style={{ textAlign: 'center' }}>{r._count.rolePermissions}</td>
                <td>
                  <span className={`admin-badge ${r.isSystemRole ? 'admin-badge--system' : 'admin-badge--custom'}`}>
                    {r.isSystemRole ? 'System' : 'Custom'}
                  </span>
                </td>
                <td>
                  <Link to={`/admin/roles/${r.id}`} className="admin-btn admin-btn--sm">Manage</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
