import { Link, useLocation } from 'react-router-dom';

import { useAuth } from './auth';
import '../modules/billing/pages/billing.css';

// The collection cashier's single sub-nav, shown on both their billing screens
// (/billing/*) and the disbursement screens they reach (/accounting/disbursements,
// /accounting/checks) — so check printing lives "under Cashiering" without a
// separate Accounting tab. Each tab is permission-gated; the cashier holds all.
const TABS: Array<{ to: string; label: string; perm: string; exact?: boolean }> = [
  { to: '/billing/dashboard', label: 'Dashboard', perm: 'billing.read', exact: true },
  { to: '/billing/collection', label: 'Collection', perm: 'billing.payment.collect' },
  { to: '/billing/remittances', label: 'Remittances', perm: 'collections.remittance.receive' },
  { to: '/billing/consumers', label: 'Consumers', perm: 'billing.read' },
  { to: '/accounting/disbursements', label: 'Disbursement Vouchers', perm: 'accounting.dv.read' },
  { to: '/accounting/checks', label: 'Checks', perm: 'accounting.check.read' },
];

export default function CashieringSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const links = TABS.filter((t) => permissions.has(t.perm));

  return (
    <nav className="bill-subnav">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.to || pathname === '/billing'
          : pathname.startsWith(link.to);
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
