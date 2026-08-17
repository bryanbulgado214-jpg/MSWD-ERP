// Financial reports reuse the existing Accounting pages (no duplicate logic) —
// they simply render under the Reports layout / navigation.
import FinancialStatementsPage from '../accounting/pages/FinancialStatementsPage';
import GeneralLedgerPage from '../accounting/pages/GeneralLedgerPage';
import SubsidiaryLedgerPage from '../accounting/pages/SubsidiaryLedgerPage';
import TrialBalancePage from '../accounting/pages/TrialBalancePage';

import { ApAgingReportPage } from './pages/ApAgingReportPage';
import { ApRegisterReportPage } from './pages/ApRegisterReportPage';
import { ApSubsidiaryLedgerPage } from './pages/ApSubsidiaryLedgerPage';
import { ArAgingReportPage } from './pages/ArAgingReportPage';
import { ArSubsidiaryLedgerPage } from './pages/ArSubsidiaryLedgerPage';
import { BankReconciliationReportPage } from './pages/BankReconciliationReportPage';
import { BudgetReportPage } from './pages/BudgetReportPage';
import { CashBankActivityPage } from './pages/CashBankActivityPage';
import { CheckRegisterReportPage } from './pages/CheckRegisterReportPage';
import { DepreciationScheduleReportPage } from './pages/DepreciationScheduleReportPage';
import { FixedAssetLapsingReportPage } from './pages/FixedAssetLapsingReportPage';
import { FixedAssetRegisterPage } from './pages/FixedAssetRegisterPage';
import { JournalEntryRegisterPage } from './pages/JournalEntryRegisterPage';
import { LoanAmortizationPage } from './pages/LoanAmortizationPage';
import { PayeesPage } from './pages/PayeesPage';
import { ProcurementReportPage } from './pages/ProcurementReportPage';
import { RciReportPage } from './pages/RciReportPage';
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
      { path: 'payees', element: <PayeesPage /> },

      // ── Receivables ────────────────────────────────────────────────────
      { path: 'ar-aging', element: <ArAgingReportPage /> },
      { path: 'ar-subsidiary-ledger', element: <ArSubsidiaryLedgerPage /> },

      // ── Payables ───────────────────────────────────────────────────────
      { path: 'ap-register', element: <ApRegisterReportPage /> },
      { path: 'ap-aging', element: <ApAgingReportPage /> },
      { path: 'ap-subsidiary-ledger', element: <ApSubsidiaryLedgerPage /> },
      { path: 'loan-amortization', element: <LoanAmortizationPage /> },

      // ── Cash & Banks ───────────────────────────────────────────────────
      { path: 'report-of-checks-issued', element: <RciReportPage /> },
      { path: 'check-register', element: <CheckRegisterReportPage /> },
      { path: 'bank-reconciliation', element: <BankReconciliationReportPage /> },
      { path: 'cash-bank-activity', element: <CashBankActivityPage /> },

      // ── Fixed Assets ───────────────────────────────────────────────────
      { path: 'fixed-asset-register', element: <FixedAssetRegisterPage /> },
      { path: 'fixed-asset-lapsing', element: <FixedAssetLapsingReportPage /> },
      { path: 'depreciation-schedule', element: <DepreciationScheduleReportPage /> },

      // ── Procurement / Budget (existing) ────────────────────────────────
      { path: 'procurement', element: <ProcurementReportPage /> },
      { path: 'budget', element: <BudgetReportPage /> },
      { path: 'suppliers', element: <SupplierReportPage /> },
    ],
  },
];
