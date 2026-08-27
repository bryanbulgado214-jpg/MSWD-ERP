import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

// Each report declares the permission needed to open it. Reports are organised
// into categories; a category is shown only when the user can open at least one
// report inside it. Permissions mirror the backing endpoints so a visible link
// never 403s.
export interface ReportTab {
  to: string;
  label: string;
  perm: string;
  icon: string;
  blurb: string;
}

export interface ReportGroup {
  label: string;
  items: ReportTab[];
}

export const REPORT_GROUPS: ReportGroup[] = [
  {
    label: 'Financial Reports',
    items: [
      {
        to: '/reports/financial-statements',
        label: 'Financial Statements',
        perm: 'accounting.read',
        icon: '🧾',
        blurb: 'Position, Income & Cash Flows',
      },
      {
        to: '/reports/trial-balance',
        label: 'Trial Balance',
        perm: 'accounting.read',
        icon: '⚖️',
        blurb: 'Debits & credits by account',
      },
    ],
  },
  {
    label: 'Books & Ledgers',
    items: [
      {
        to: '/reports/general-ledger',
        label: 'General Ledger',
        perm: 'accounting.read',
        icon: '📖',
        blurb: 'Account balances by period',
      },
      {
        to: '/reports/subsidiary-ledgers',
        label: 'Subsidiary Ledgers',
        perm: 'accounting.read',
        icon: '📇',
        blurb: 'Per-account transaction detail',
      },
      {
        to: '/reports/journal-entry-register',
        label: 'Journal Entry Register',
        perm: 'accounting.read',
        icon: '📒',
        blurb: 'All recorded journal vouchers',
      },
      {
        to: '/reports/payees',
        label: 'List of Payees',
        perm: 'accounting.read',
        icon: '🧑‍💼',
        blurb: 'Suppliers & payees master list',
      },
    ],
  },
  {
    label: 'Collections',
    items: [
      {
        to: '/billing/cashier-report',
        label: 'Cashier Report',
        perm: 'collections.cashier.report',
        icon: '🧾',
        blurb: "Cashier's daily collection report",
      },
      {
        to: '/reports/collection-tellers',
        label: 'Tellers',
        perm: 'collections.setup.manage',
        icon: '🧑‍💼',
        blurb: 'Teller / collector master list',
      },
      {
        to: '/reports/collection-locations',
        label: 'Collection Location',
        perm: 'collections.setup.manage',
        icon: '📍',
        blurb: 'Collection center master list',
      },
    ],
  },
  {
    label: 'Receivables',
    items: [
      {
        to: '/reports/ar-aging',
        label: 'AR Aging',
        perm: 'billing.reports',
        icon: '⏳',
        blurb: 'Overdue water bills by bracket',
      },
      {
        to: '/reports/ar-subsidiary-ledger',
        label: 'AR Subsidiary Ledger',
        perm: 'billing.reports',
        icon: '👤',
        blurb: 'Per-consumer receivable ledger',
      },
    ],
  },
  {
    label: 'Payables',
    items: [
      {
        to: '/reports/ap-register',
        label: 'AP Register',
        perm: 'accounting.dv.read',
        icon: '📤',
        blurb: 'Disbursement vouchers',
      },
      {
        to: '/reports/ap-aging',
        label: 'AP Aging',
        perm: 'accounting.reports',
        icon: '🗓️',
        blurb: 'Unpaid DVs by bracket',
      },
      {
        to: '/reports/ap-subsidiary-ledger',
        label: 'AP Subsidiary Ledger',
        perm: 'accounting.dv.read',
        icon: '🏢',
        blurb: 'Per-payee payable ledger',
      },
      {
        to: '/reports/loan-amortization',
        label: 'Loans & Amortization',
        perm: 'accounting.read',
        icon: '🏦',
        blurb: 'Loan repayment schedules',
      },
    ],
  },
  {
    label: 'Cash & Banks',
    items: [
      {
        to: '/reports/report-of-checks-issued',
        label: 'Report of Checks Issued',
        perm: 'accounting.check.read',
        icon: '🧾',
        blurb: 'Monthly RCI (COA Appendix 35)',
      },
      {
        to: '/reports/check-register',
        label: 'Check Register',
        perm: 'accounting.check.read',
        icon: '💳',
        blurb: 'Check history',
      },
      {
        to: '/reports/bank-reconciliation',
        label: 'Bank Reconciliation Report',
        perm: 'accounting.read',
        icon: '🔁',
        blurb: 'Completed reconciliations',
      },
      {
        to: '/reports/cash-bank-activity',
        label: 'Cash / Bank Activity',
        perm: 'accounting.read',
        icon: '💵',
        blurb: 'Cash movement over a period',
      },
    ],
  },
  {
    label: 'Fixed Assets',
    items: [
      {
        to: '/reports/fixed-asset-register',
        label: 'Fixed Asset Register',
        perm: 'asset.reports',
        icon: '🏗️',
        blurb: 'Property, plant & equipment',
      },
      {
        to: '/reports/fixed-asset-lapsing',
        label: 'Fixed Asset Lapsing',
        perm: 'asset.reports',
        icon: '📉',
        blurb: 'Lapsing / net book value',
      },
      {
        to: '/reports/depreciation-schedule',
        label: 'Depreciation Schedule',
        perm: 'asset.reports',
        icon: '📆',
        blurb: 'Depreciation by period',
      },
    ],
  },
  {
    label: 'Procurement & Budget',
    items: [
      {
        to: '/reports/procurement',
        label: 'Procurement',
        perm: 'procurement.read',
        icon: '🛒',
        blurb: 'Procurement analytics',
      },
      {
        to: '/reports/budget',
        label: 'Budget Utilization',
        perm: 'budgeting.read',
        icon: '💰',
        blurb: 'Budget vs. actual',
      },
      {
        to: '/reports/suppliers',
        label: 'Suppliers',
        perm: 'procurement.read',
        icon: '🚚',
        blurb: 'Supplier analytics',
      },
    ],
  },
];

/** Groups (with their visible items) the current user can open. */
export function accessibleReportGroups(permissions: Set<string>): ReportGroup[] {
  return REPORT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => permissions.has(i.perm)),
  })).filter((g) => g.items.length > 0);
}

/** First report the current user can open (for the landing redirect). */
export function firstAccessibleReport(permissions: Set<string>): ReportTab | null {
  return accessibleReportGroups(permissions)[0]?.items[0] ?? null;
}

export function ReportsSubNav() {
  const { pathname } = useLocation();
  const { permissions } = useAuth();
  const groups = useMemo(() => accessibleReportGroups(permissions), [permissions]);

  const activeGroupLabel = useMemo(
    () => groups.find((g) => g.items.some((i) => pathname.startsWith(i.to)))?.label ?? null,
    [groups, pathname],
  );

  // The flyout is a transient menu: closed by default, opened by clicking a
  // category, and closed again once the user picks a report (or clicks outside).
  // The category holding the current page is highlighted even while closed.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Clicking anywhere outside the nav collapses the open category.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!openGroup) return;
    function onPointerDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openGroup]);

  return (
    <nav className="reports-subnav" aria-label="Reports" ref={navRef}>
      {groups.map((group) => {
        const open = openGroup === group.label;
        return (
          <div
            key={group.label}
            className={`reports-subnav__group${open ? ' reports-subnav__group--open' : ''}`}
          >
            <button
              type="button"
              className={`reports-subnav__group-label${
                open
                  ? ' reports-subnav__group-label--open'
                  : group.label === activeGroupLabel
                    ? ' reports-subnav__group-label--active'
                    : ''
              }`}
              aria-expanded={open}
              onClick={() => setOpenGroup(open ? null : group.label)}
            >
              {group.label}
              <span className="reports-subnav__chevron">›</span>
            </button>
            {open && (
              <div className="reports-subnav__flyout" role="group" aria-label={group.label}>
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`reports-subnav__link${pathname.startsWith(item.to) ? ' reports-subnav__link--active' : ''}`}
                    onClick={() => setOpenGroup(null)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
