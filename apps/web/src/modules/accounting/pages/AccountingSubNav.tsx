import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import CashieringSubNav from '../../../app/CashieringSubNav';
import { isCashierHome } from '../../../app/module-access';

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
  // Extra path prefixes that also count as "active" (e.g. a detail route that
  // lives under a different top-level path than the hub it belongs to).
  also?: string[];
  group?: 'main' | 'setup';
  // A collapsible group whose links fly out to the side (like the Reports
  // sub-nav). The parent's own `to` may be a synthetic key when there is no
  // landing page — only its children navigate.
  children?: AccountingLink[];
  visible: (permissions: Set<string>) => boolean;
}

const has = (code: string) => (p: Set<string>) => p.has(code);
const hasAny =
  (...codes: string[]) =>
  (p: Set<string>) =>
    codes.some((c) => p.has(c));
// A cashier holds check.read but not the broad accounting.read.
const isCashier = (p: Set<string>) => p.has('accounting.check.read') && !p.has('accounting.read');
// The collection screens open to full accounting staff and to the collection
// cashier (collections.accounting.view) without the broad accounting.read.
const canCollections = hasAny('accounting.read', 'collections.accounting.view');

export const ACCOUNTING_LINKS: AccountingLink[] = [
  // Cashier's landing — a cashiering dashboard (checks + DVs only).
  { to: '/accounting/cashiering', label: 'Dashboard', visible: isCashier },
  // Day-to-day accounting operations, in accounting-workflow order.
  { to: '/accounting/dashboard', label: 'Dashboard', visible: has('accounting.read') },
  { to: '/accounting/jev', label: 'Journal Entries', visible: has('accounting.read') },
  {
    to: '/accounting/collections',
    label: 'Collections',
    also: ['/accounting/collection-batches'],
    visible: canCollections,
  },
  {
    to: '/accounting/disbursements',
    label: 'Disbursement Vouchers',
    visible: has('accounting.dv.read'),
  },
  {
    to: '/accounting/supplier-invoices',
    label: "Supplier's Invoices",
    visible: has('accounting.read'),
  },
  // Cash Management — bank accounts, checks, reconciliation and petty cash grouped.
  {
    to: '/accounting/cash',
    label: 'Cash Management',
    visible: hasAny(
      'accounting.read',
      'accounting.check.read',
      'accounting.bank.manage',
      'accounting.petty_cash.read',
    ),
    children: [
      { to: '/accounting/banks', label: 'Bank Accounts', visible: has('accounting.read') },
      { to: '/accounting/checks', label: 'Checks', visible: has('accounting.check.read') },
      {
        to: '/accounting/reconciliations',
        label: 'Bank Reconciliation',
        visible: has('accounting.bank.manage'),
      },
      {
        to: '/accounting/petty-cash',
        label: 'Petty Cash Fund',
        visible: has('accounting.petty_cash.read'),
      },
    ],
  },
  {
    to: '/accounting/supply-ledger',
    label: 'Supplies Ledger',
    visible: has('accounting.supply_ledger.read'),
  },
  // Configuration — separated from daily operations.
  {
    to: '/accounting/coa',
    label: 'Chart of Accounts',
    exact: true,
    group: 'setup',
    visible: has('accounting.read'),
  },
  {
    to: '/accounting/periods',
    label: 'Accounting Periods',
    group: 'setup',
    visible: has('accounting.read'),
  },
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

  // A group's links fly out on click; one group open at a time, closed on an
  // outside click or after picking a link.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openGroup]);

  const isActive = (link: AccountingLink) =>
    link.exact
      ? pathname === link.to
      : pathname.startsWith(link.to) || (link.also ?? []).some((p) => pathname.startsWith(p));

  // For the cashier, the disbursement screens (DVs & Checks) live under the
  // Cashiering sub-nav — there is no separate Accounting tab.
  if (isCashierHome(permissions)) return <CashieringSubNav />;

  const links = accessibleAccountingLinks(permissions);
  const mainLinks = links.filter((l) => (l.group ?? 'main') === 'main');
  const setupLinks = links.filter((l) => l.group === 'setup');

  const renderLink = (link: AccountingLink) => (
    <Link
      key={link.to}
      to={link.to}
      className={`acct-subnav__link${isActive(link) ? ' acct-subnav__link--active' : ''}`}
    >
      {link.label}
    </Link>
  );

  // A group header: clicking it flies its links out to the right; the header
  // stays highlighted (even when closed) while one of its pages is open.
  const renderGroup = (link: AccountingLink) => {
    const kids = (link.children ?? []).filter((c) => c.visible(permissions));
    if (kids.length === 0) return null;
    const open = openGroup === link.to;
    const sectionActive = kids.some((c) => isActive(c));
    return (
      <div key={link.to} className="acct-subnav__group">
        <button
          type="button"
          className={`acct-subnav__link acct-subnav__group-label${
            open
              ? ' acct-subnav__group-label--open'
              : sectionActive
                ? ' acct-subnav__link--active'
                : ''
          }`}
          aria-expanded={open}
          onClick={() => setOpenGroup(open ? null : link.to)}
        >
          <span>{link.label}</span>
          <span className="acct-subnav__chevron" aria-hidden="true">
            ›
          </span>
        </button>
        {open && (
          <div className="acct-subnav__flyout" role="group" aria-label={link.label}>
            {kids.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className={`acct-subnav__link${isActive(c) ? ' acct-subnav__link--active' : ''}`}
                onClick={() => setOpenGroup(null)}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="acct-subnav" ref={navRef}>
      {mainLinks.map((l) => (l.children ? renderGroup(l) : renderLink(l)))}
      {setupLinks.length > 0 && (
        <>
          <div className="acct-subnav__heading">Accounting Setup</div>
          {setupLinks.map((l) => renderLink(l))}
        </>
      )}
    </nav>
  );
}
