import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

// Each tab shows only if the user holds one of its permissions, so a role sees
// just the parts of procurement it works with (e.g. the procurement officer sees
// only Purchase Requests + Purchase Orders).
const LINKS: { to: string; label: string; exact?: boolean; perms: string[] }[] = [
  { to: '/procurement/dashboard', label: 'Dashboard', perms: ['procurement.read'] },
  { to: '/procurement', label: 'Purchase Requests', exact: true, perms: ['procurement.read'] },
  {
    to: '/procurement/purchase-orders',
    label: 'Purchase Orders',
    perms: ['procurement.po.create', 'procurement.po.approve'],
  },
  { to: '/procurement/suppliers', label: 'Suppliers', perms: ['procurement.supplier.manage'] },
  {
    to: '/procurement/cafs',
    label: 'CAFs',
    perms: ['procurement.caf.create', 'procurement.caf.certify'],
  },
  {
    to: '/procurement/ors',
    label: 'ORS',
    perms: [
      'procurement.ors.create',
      'procurement.ors.budget_certify',
      'procurement.ors.requesting_certify',
    ],
  },
  {
    to: '/procurement/inspections',
    label: 'Inspections',
    perms: ['procurement.inspection.create', 'procurement.inspection.accept'],
  },
  {
    to: '/procurement/dvs',
    label: 'DVs',
    perms: [
      'procurement.dv.create',
      'procurement.dv.certify',
      'procurement.dv.approve',
      'procurement.dv.release',
    ],
  },
  { to: '/procurement/ppmp-items', label: 'PPMP Items', perms: ['procurement.ppmp.manage'] },
  { to: '/procurement/app', label: 'APP (Consolidated)', perms: ['procurement.app.manage'] },
  {
    to: '/procurement/delegations',
    label: 'Delegations',
    perms: ['procurement.delegation.manage'],
  },
  { to: '/procurement/audit-trail', label: 'Audit Trail', perms: ['procurement.bac.view'] },
];

export function ProcurementSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const visible = LINKS.filter((link) => link.perms.some((p) => permissions.has(p)));

  return (
    <nav className="pr-subnav">
      {visible.map((link) => {
        const active = link.exact ? pathname === link.to : pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`pr-subnav__link${active ? ' pr-subnav__link--active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
