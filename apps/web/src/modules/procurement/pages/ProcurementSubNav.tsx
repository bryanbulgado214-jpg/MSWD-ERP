import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/procurement', label: 'Purchase Requests', exact: true },
  { to: '/procurement/purchase-orders', label: 'Purchase Orders' },
  { to: '/procurement/suppliers', label: 'Suppliers' },
  { to: '/procurement/cafs', label: 'CAFs' },
  { to: '/procurement/ors', label: 'ORS' },
  { to: '/procurement/ppmp-items', label: 'PPMP Items' },
  { to: '/procurement/delegations', label: 'Delegations' },
  { to: '/procurement/audit-trail', label: 'Audit Trail' },
];

export function ProcurementSubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="pr-subnav">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.to
          : pathname.startsWith(link.to);
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
