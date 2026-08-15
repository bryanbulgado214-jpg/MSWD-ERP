// Financial reports reuse the existing Accounting pages (no duplicate logic) —
// they simply render under the Reports layout / navigation.
import FinancialStatementsPage from '../accounting/pages/FinancialStatementsPage';
import GeneralLedgerPage from '../accounting/pages/GeneralLedgerPage';
import SubsidiaryLedgerPage from '../accounting/pages/SubsidiaryLedgerPage';
import TrialBalancePage from '../accounting/pages/TrialBalancePage';

import { ApAgingReportPage } from './pages/ApAgingReportPage';
import { ApRegisterReportPage } from './pages/ApRegisterReportPage';
import { ArAgingReportPage } from './pages/ArAgingReportPage';
import { BankReconciliationReportPage } from './pages/BankReconciliationReportPage';
import { BudgetReportPage } from './pages/BudgetReportPage';
import { CheckRegisterReportPage } from './pages/CheckRegisterReportPage';
import { FixedAssetLapsingReportPage } from './pages/FixedAssetLapsingReportPage';
import { JournalEntryRegisterPage } from './pages/JournalEntryRegisterPage';
import { ProcurementReportPage } from './pages/ProcurementReportPage';
import { ReportPlaceholder } from './pages/ReportPlaceholder';
import { ReportsLanding } from './pages/ReportsLanding';
import { ReportsLayout } from './pages/ReportsLayout';
import { SubsidiaryLedgersIndexPage } from './pages/SubsidiaryLedgersIndexPage';
import { SupplierReportPage } from './pages/SupplierReportPage';

export const reportsRoutes = [
  {
    path: '/reports',
    element: <ReportsLayout />,
    children: [
      { index: true, element: <ReportsLanding /> },

      // ── Financial Reports ──────────────────────────────────────────────
      { path: 'financial-statements', element: <FinancialStatementsPage /> },
      { path: 'trial-balance', element: <TrialBalancePage /> },

      // ── Books & Ledgers ────────────────────────────────────────────────
      { path: 'general-ledger', element: <GeneralLedgerPage /> },
      { path: 'subsidiary-ledgers', element: <SubsidiaryLedgersIndexPage /> },
      { path: 'subsidiary-ledgers/:accountId', element: <SubsidiaryLedgerPage /> },
      { path: 'journal-entry-register', element: <JournalEntryRegisterPage /> },

      // ── Receivables ────────────────────────────────────────────────────
      { path: 'ar-aging', element: <ArAgingReportPage /> },
      {
        path: 'ar-subsidiary-ledger',
        element: (
          <ReportPlaceholder
            title="AR Subsidiary Ledger"
            description="Per-consumer receivable ledger — every bill, payment, and running balance."
            requiredData="a per-consumer receivable ledger view over the Billing module"
          />
        ),
      },

      // ── Payables ───────────────────────────────────────────────────────
      { path: 'ap-register', element: <ApRegisterReportPage /> },
      { path: 'ap-aging', element: <ApAgingReportPage /> },
      {
        path: 'ap-subsidiary-ledger',
        element: (
          <ReportPlaceholder
            title="AP Subsidiary Ledger"
            description="Per-payee/supplier payable ledger — vouchers, payments, and running balance."
            requiredData="a per-supplier payable ledger view over Disbursement Vouchers"
          />
        ),
      },

      // ── Cash & Banks ───────────────────────────────────────────────────
      { path: 'check-register', element: <CheckRegisterReportPage /> },
      { path: 'bank-reconciliation', element: <BankReconciliationReportPage /> },
      {
        path: 'cash-bank-activity',
        element: (
          <ReportPlaceholder
            title="Cash / Bank Activity"
            description="Cash-account movement (receipts and disbursements) over a selected period."
            requiredData="a cash/bank activity view over posted GL cash-account lines"
          />
        ),
      },

      // ── Fixed Assets ───────────────────────────────────────────────────
      {
        path: 'fixed-asset-register',
        element: (
          <ReportPlaceholder
            title="Fixed Asset Register"
            description="Complete register of property, plant & equipment with acquisition and custody details."
            requiredData="a report-scoped Fixed Asset register endpoint (Asset module)"
          />
        ),
      },
      { path: 'fixed-asset-lapsing', element: <FixedAssetLapsingReportPage /> },
      {
        path: 'depreciation-schedule',
        element: (
          <ReportPlaceholder
            title="Depreciation Schedule"
            description="Period-by-period depreciation charges generated from posted depreciation runs."
            requiredData="posted depreciation runs (Asset → Depreciation)"
          />
        ),
      },

      // ── Procurement / Budget (existing) ────────────────────────────────
      { path: 'procurement', element: <ProcurementReportPage /> },
      { path: 'budget', element: <BudgetReportPage /> },
      { path: 'suppliers', element: <SupplierReportPage /> },
    ],
  },
];
