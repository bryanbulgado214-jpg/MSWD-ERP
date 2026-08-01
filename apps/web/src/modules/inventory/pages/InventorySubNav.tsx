import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/inventory', label: 'Items', exact: true },
  { to: '/inventory/stock-receipts', label: 'Stock Receipts' },
  { to: '/inventory/ris', label: 'RIS' },
  { to: '/inventory/property-records', label: 'Property Records' },
  { to: '/inventory/accountability', label: 'PAR/ICS' },
  { to: '/inventory/physical-counts', label: 'Physical Counts' },
  { to: '/inventory/disposal', label: 'Disposal/WMR' },
];

export function InventorySubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="inv-subnav">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.to
          : pathname.startsWith(link.to);
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
