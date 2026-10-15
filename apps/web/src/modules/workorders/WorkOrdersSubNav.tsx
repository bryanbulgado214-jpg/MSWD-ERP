import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../app/auth';
import './workorders.css';

interface WoNavLink {
  to: string;
  label: string;
  perm?: string;
}

// The named sub-sections; anything else under /work-orders (the list, a WO
// detail/edit, "new") keeps the "Work Orders" link active.
const NAMED = new Set(['dashboard', 'staff', 'teams', 'reports', 'ccf']);

export default function WorkOrdersSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();

  const seg = pathname.replace(/^\/work-orders\/?/, '').split('/')[0] || '';

  const links: WoNavLink[] = [
    { to: '/work-orders/dashboard', label: 'Dashboard' },
    { to: '/work-orders', label: 'Work Orders' },
    { to: '/work-orders/staff', label: 'Staff Availability' },
    { to: '/work-orders/teams', label: 'Teams & Personnel', perm: 'workorder.team.manage' },
    { to: '/work-orders/ccf', label: 'Customer Complaints' },
  ].filter((l) => !l.perm || permissions.has(l.perm));

  const isActive = (to: string) => {
    const target = to.replace(/^\/work-orders\/?/, '');
    if (target === '') {
      return pathname === '/work-orders' || (pathname.startsWith('/work-orders/') && !NAMED.has(seg));
    }
    return seg === target;
  };

  return (
    <nav className="wo-subnav">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={`wo-subnav__link${isActive(l.to) ? ' wo-subnav__link--active' : ''}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
