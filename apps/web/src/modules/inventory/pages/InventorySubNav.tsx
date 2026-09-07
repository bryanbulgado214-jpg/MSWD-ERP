import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

type InvLink = {
  to: string;
  label: string;
  exact?: boolean;
  visible: (perms: Set<string>) => boolean;
};

// Warehouseman sees the physical-flow tabs (Items, Receipts, RIS); the
// stock-card personnel additionally sees records, counts, disposal, and the
// month-end JEV. Each tab shows only if the user holds a matching permission.
const LINKS: InvLink[] = [
  { to: '/inventory', label: 'Items', exact: true, visible: (p) => p.has('inventory.read') },
  {
    to: '/inventory/stock-receipts',
    label: 'Stock Receipts',
    visible: (p) => p.has('inventory.read'),
  },
  { to: '/inventory/ris', label: 'RIS', visible: (p) => p.has('inventory.read') },
  {
    to: '/inventory/property-records',
    label: 'Property Records',
    visible: (p) => p.has('inventory.property.manage'),
  },
  {
    to: '/inventory/accountability',
    label: 'PAR/ICS',
    visible: (p) => p.has('inventory.accountability.manage'),
  },
  {
    to: '/inventory/physical-counts',
    label: 'Physical Counts',
    visible: (p) => p.has('inventory.physical_count.manage'),
  },
  {
    to: '/inventory/disposal',
    label: 'Disposal/WMR',
    visible: (p) => p.has('inventory.dispose.manage'),
  },
  {
    to: '/inventory/month-end',
    label: 'Month-End JEV',
    visible: (p) => p.has('inventory.gl.post'),
  },
];

export function InventorySubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();

  return (
    <nav className="inv-subnav">
      {LINKS.filter((link) => link.visible(permissions)).map((link) => {
        const active = link.exact ? pathname === link.to : pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`inv-subnav__link${active ? ' inv-subnav__link--active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
