import { Link, useLocation } from 'react-router-dom';
import './admin.css';

const LINKS = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/roles', label: 'Roles' },
  { to: '/admin/audit-trail', label: 'Audit Trail' },
  { to: '/admin/district-profile', label: 'District Profile' },
  { to: '/admin/signatories', label: 'Signatories' },
  { to: '/admin/demo-data', label: 'Demo Data' },
];

export function AdminSubNav() {
  const { pathname } = useLocation();
  return (
    <nav className="admin-subnav">
      {LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={`admin-subnav__link${pathname.startsWith(l.to) ? ' admin-subnav__link--active' : ''}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
