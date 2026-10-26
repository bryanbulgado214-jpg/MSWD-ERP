import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../app/auth';
import './workorders.css';

interface WoNavLink {
  to: string;
  label: string;
  perm?: string;
  // Shown when the user holds ANY of these permissions.
  anyPerm?: string[];
}

// The named sub-sections; anything else under /work-orders (the list, a WO
// detail/edit, "new") keeps the "Work Orders" link active.
const NAMED = new Set(['dashboard', 'staff', 'reports', 'ccf']);

export default function WorkOrdersSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();

  const seg = pathname.replace(/^\/work-orders\/?/, '').split('/')[0] || '';

  const allLinks: WoNavLink[] = [
    { to: '/work-orders/dashboard', label: 'Dashboard' },
    { to: '/work-orders', label: 'Work Orders' },
    // Staff Availability (and its Teams & Personnel tab) is only for the field
    // heads — hidden from intake/clerk accounts that just do CCFs + work orders.
    {
      to: '/work-orders/staff',
      label: 'Staff Availability',
      anyPerm: ['workorder.staff.manage', 'workorder.team.manage'],
    },
    { to: '/work-orders/ccf', label: 'Customer Complaints' },
  ];
  const links = allLinks.filter((l) => {
    if (l.perm) return permissions.has(l.perm);
    if (l.anyPerm) return l.anyPerm.some((p) => permissions.has(p));
    return true;
  });

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
