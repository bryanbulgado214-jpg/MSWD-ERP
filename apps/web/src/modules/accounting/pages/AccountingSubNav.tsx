import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

// Each tab declares when it is visible. The sub-nav only renders tabs the user
// can actually open — e.g. a cashier (no accounting.read) sees only the
// Cashiering dashboard, Disbursement Vouchers and Checks.
//
// Reporting outputs (General Ledger, Trial Balance, Financial Statements) live
// under the Reports module, not here — Accounting holds screens where users
// create, process, approve, post, reconcile, or configure.
export interface AccountingLink {
  to: string;
  label: string;
  exact?: boolean;
  group?: 'main' | 'setup';
  visible: (permissions: Set<string>) => boolean;
}

const has = (code: string) => (p: Set<string>) => p.has(code);
// A cashier holds check.read but not the broad accounting.read.
const isCashier = (p: Set<string>) => p.has('accounting.check.read') && !p.has('accounting.read');

export const ACCOUNTING_LINKS: AccountingLink[] = [
  // Cashier's landing — a cashiering dashboard (checks + DVs only).
  { to: '/accounting/cashiering', label: 'Dashboard', visible: isCashier },
  // Day-to-day accounting operations, in accounting-workflow order.
  { to: '/accounting/dashboard', label: 'Dashboard', visible: has('accounting.read') },
  {
    to: '/accounting/coa',
    label: 'Chart of Accounts',
    exact: true,
    visible: has('accounting.read'),
  },
  { to: '/accounting/jev', label: 'Journal Entries', visible: has('accounting.read') },
  {
    to: '/accounting/collection-batches',
    label: 'Collection Batches',
    visible: has('accounting.read'),
  },
  {
    to: '/accounting/collections/reconciliation',
    label: 'Collections Reconciliation',
    visible: has('accounting.read'),
  },
  {
    to: '/accounting/disbursements',
    label: 'Disbursement Vouchers',
    visible: has('accounting.dv.read'),
  },
  { to: '/accounting/banks', label: 'Bank Accounts', visible: has('accounting.read') },
  { to: '/accounting/checks', label: 'Checks', visible: has('accounting.check.read') },
  {
    to: '/accounting/reconciliations',
    label: 'Bank Reconciliation',
    visible: has('accounting.bank.manage'),
  },
  { to: '/accounting/periods', label: 'Accounting Periods', visible: has('accounting.read') },
  // Configuration — separated from daily operations.
  {
    to: '/accounting/mappings',
    label: 'Account Mappings',
    group: 'setup',
    visible: has('accounting.coa.manage'),
  },
];

export function accessibleAccountingLinks(permissions: Set<string>): AccountingLink[] {
  return ACCOUNTING_LINKS.filter((l) => l.visible(permissions));
}

export function AccountingSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const links = accessibleAccountingLinks(permissions);
  const mainLinks = links.filter((l) => (l.group ?? 'main') === 'main');
  const setupLinks = links.filter((l) => l.group === 'setup');

  const renderLink = (link: AccountingLink) => {
    const active = link.exact ? pathname === link.to : pathname.startsWith(link.to);
    return (
      <Link
        key={link.to}
        to={link.to}
        className={`acct-subnav__link${active ? ' acct-subnav__link--active' : ''}`}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <nav className="acct-subnav">
      {mainLinks.map(renderLink)}
      {setupLinks.length > 0 && (
        <>
          <div className="acct-subnav__heading">Accounting Setup</div>
          {setupLinks.map(renderLink)}
        </>
      )}
    </nav>
  );
}
