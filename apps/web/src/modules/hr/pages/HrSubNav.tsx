import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/hr', label: 'Dashboard', match: ['/hr'], exact: true },
  { to: '/hr/employees', label: 'Employees', match: ['/hr/employees'] },
  { to: '/hr/positions', label: 'Positions', match: ['/hr/positions'] },
  { to: '/hr/leave', label: 'Leave', match: ['/hr/leave'] },
  { to: '/hr/dtr', label: 'Attendance', match: ['/hr/dtr'] },
  { to: '/hr/compensation', label: 'Compensation', match: ['/hr/compensation'] },
  { to: '/hr/payroll', label: 'Payroll', match: ['/hr/payroll'] },
  { to: '/hr/remittances', label: 'Remittances', match: ['/hr/remittances'] },
  { to: '/hr/reports', label: 'Reports', match: ['/hr/reports'] },
];

export default function HrSubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="hr-subnav">
      {LINKS.map((link) => {
        const active = link.exact
          ? link.match.some((m) => pathname === m)
          : link.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`hr-subnav__link${active ? ' hr-subnav__link--active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
