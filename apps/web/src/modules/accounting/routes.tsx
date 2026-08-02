import type { RouteObject } from 'react-router-dom';

import AccountMappingsPage from './pages/AccountMappingsPage';
import BankReconciliationPage from './pages/BankReconciliationPage';
import BanksPage from './pages/BanksPage';
import CheckRegisterPage from './pages/CheckRegisterPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import FinancialStatementsPage from './pages/FinancialStatementsPage';
import GeneralLedgerPage from './pages/GeneralLedgerPage';
import JevDetailPage from './pages/JevDetailPage';
import JevListPage from './pages/JevListPage';
import PeriodManagementPage from './pages/PeriodManagementPage';
import SubsidiaryLedgerPage from './pages/SubsidiaryLedgerPage';
import TrialBalancePage from './pages/TrialBalancePage';

export const accountingRoutes: RouteObject[] = [
  { path: '/accounting', element: <ChartOfAccountsPage /> },
  { path: '/accounting/banks', element: <BanksPage /> },
  { path: '/accounting/mappings', element: <AccountMappingsPage /> },
  { path: '/accounting/jev', element: <JevListPage /> },
  { path: '/accounting/jev/new', element: <JevDetailPage /> },
  { path: '/accounting/jev/:id', element: <JevDetailPage /> },
  { path: '/accounting/gl', element: <GeneralLedgerPage /> },
  { path: '/accounting/gl/trial-balance', element: <TrialBalancePage /> },
  { path: '/accounting/gl/subsidiary/:accountId', element: <SubsidiaryLedgerPage /> },
  { path: '/accounting/checks', element: <CheckRegisterPage /> },
  { path: '/accounting/reconciliations', element: <BankReconciliationPage /> },
  { path: '/accounting/reconciliations/:id', element: <BankReconciliationPage /> },
  { path: '/accounting/periods', element: <PeriodManagementPage /> },
  { path: '/accounting/financial-statements', element: <FinancialStatementsPage /> },
];
