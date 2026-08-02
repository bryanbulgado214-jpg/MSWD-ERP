import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/accounting', label: 'Chart of Accounts', exact: true },
  { to: '/accounting/banks', label: 'Banks & Accounts' },
  { to: '/accounting/mappings', label: 'Account Mappings' },
  { to: '/accounting/jev', label: 'Journal Entries' },
  { to: '/accounting/gl', label: 'General Ledger', exact: true },
  { to: '/accounting/gl/trial-balance', label: 'Trial Balance' },
  { to: '/accounting/checks', label: 'Checks' },
  { to: '/accounting/reconciliations', label: 'Reconciliation' },
  { to: '/accounting/periods', label: 'Periods' },
  { to: '/accounting/financial-statements', label: 'Financial Statements' },
];

export function AccountingSubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="acct-subnav">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.to
          : pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`acct-subnav__link${active ? ' acct-subnav__link--active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
