import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

// Each tab declares when it is visible, so users only see tabs they can open —
// e.g. an accountant granted only billing.reports sees just Dashboard + Reports
// (for the receivables aging report), never the operational billing screens.
const has = (code: string) => (p: Set<string>) => p.has(code);
const hasAny =
  (...codes: string[]) =>
  (p: Set<string>) =>
    codes.some((c) => p.has(c));

const LINKS: Array<{
  to: string;
  label: string;
  exact?: boolean;
  visible: (p: Set<string>) => boolean;
}> = [
  {
    to: '/billing/dashboard',
    label: 'Dashboard',
    exact: true,
    visible: hasAny('billing.read', 'billing.reports'),
  },
  { to: '/billing/collection', label: 'Collection', visible: has('billing.payment.collect') },
  { to: '/billing/session', label: 'My Session', visible: has('billing.session.manage') },
  {
    to: '/billing/remittances',
    label: 'Remittances',
    visible: has('collections.remittance.receive'),
  },
  { to: '/billing/consumers', label: 'Consumers', visible: has('billing.read') },
  { to: '/billing/meters', label: 'Meters', visible: has('billing.read') },
  { to: '/billing/rate-schedules', label: 'Rate Schedules', visible: has('billing.read') },
  { to: '/billing/periods', label: 'Periods', visible: has('billing.read') },
  { to: '/billing/readings', label: 'Readings', visible: has('billing.read') },
  { to: '/billing/bills', label: 'Bills', visible: has('billing.read') },
  { to: '/billing/payments', label: 'Payments', visible: has('billing.read') },
  { to: '/billing/disconnections', label: 'Disconnections', visible: has('billing.read') },
  {
    to: '/billing/reports',
    label: 'Reports',
    visible: hasAny('billing.reports', 'billing.reports.view'),
  },
];

export default function BillingSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const links = LINKS.filter((l) => l.visible(permissions));

  return (
    <nav className="bill-subnav">
      {links.map((link) => {
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
