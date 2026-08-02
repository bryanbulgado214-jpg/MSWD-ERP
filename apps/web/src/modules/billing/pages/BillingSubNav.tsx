import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/billing/dashboard', label: 'Dashboard', exact: true },
  { to: '/billing/consumers', label: 'Consumers', exact: false },
  { to: '/billing/meters', label: 'Meters', exact: false },
  { to: '/billing/rate-schedules', label: 'Rate Schedules', exact: false },
  { to: '/billing/periods', label: 'Periods', exact: false },
  { to: '/billing/readings', label: 'Readings', exact: false },
  { to: '/billing/bills', label: 'Bills', exact: false },
  { to: '/billing/payments', label: 'Payments', exact: false },
  { to: '/billing/disconnections', label: 'Disconnections', exact: false },
  { to: '/billing/reports', label: 'Reports', exact: false },
];

export default function BillingSubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="bill-subnav">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.to : pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`bill-subnav__link${active ? ' bill-subnav__link--active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
