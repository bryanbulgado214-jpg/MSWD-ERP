import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/reports/procurement', label: 'Procurement' },
  { to: '/reports/budget', label: 'Budget Utilization' },
  { to: '/reports/suppliers', label: 'Suppliers' },
];

export function ReportsSubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="reports-subnav">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={`reports-subnav__link${pathname.startsWith(tab.to) ? ' reports-subnav__link--active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
