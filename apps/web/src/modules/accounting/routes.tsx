import { Navigate, useParams, type RouteObject } from 'react-router-dom';

import AccountingDashboardPage from './pages/AccountingDashboardPage';
import { AccountingLanding } from './pages/AccountingLanding';
import AccountMappingsPage from './pages/AccountMappingsPage';
import BankReconciliationPage from './pages/BankReconciliationPage';
import BanksPage from './pages/BanksPage';
import Bir2307ListPage from './pages/Bir2307ListPage';
import Bir2307Page from './pages/Bir2307Page';
import CashierDashboardPage from './pages/CashierDashboardPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import CheckRegisterPage from './pages/CheckRegisterPage';
import CollectionBatchDetailPage from './pages/CollectionBatchDetailPage';
import CollectionsHubPage from './pages/CollectionsHubPage';
import DisbursementDetailPage from './pages/DisbursementDetailPage';
import DisbursementListPage from './pages/DisbursementListPage';
import JevDetailPage from './pages/JevDetailPage';
import JevListPage from './pages/JevListPage';
import NewDisbursementPage from './pages/NewDisbursementPage';
import PeriodManagementPage from './pages/PeriodManagementPage';
import { PrintCheckPage } from './pages/PrintCheckPage';
import { PrintDisbursementPage } from './pages/PrintDisbursementPage';
import { PrintJevPage } from './pages/PrintJevPage';

/** Preserves the old per-account subsidiary bookmark by forwarding the param. */
function SubsidiaryRedirect() {
  const { accountId } = useParams();
  return <Navigate to={`/reports/subsidiary-ledgers/${accountId}`} replace />;
}

export const accountingRoutes: RouteObject[] = [
  { path: '/accounting', element: <AccountingLanding /> },
  { path: '/accounting/cashiering', element: <CashierDashboardPage /> },
  { path: '/accounting/coa', element: <ChartOfAccountsPage /> },
  { path: '/accounting/dashboard', element: <AccountingDashboardPage /> },
  { path: '/accounting/banks', element: <BanksPage /> },
  { path: '/accounting/mappings', element: <AccountMappingsPage /> },
  { path: '/accounting/collections', element: <CollectionsHubPage /> },
  { path: '/accounting/collection-batches/:id', element: <CollectionBatchDetailPage /> },
  // The three former sidebar entries now live as sub-tabs of the Collections hub;
  // keep the old URLs working as redirects.
  {
    path: '/accounting/collection-batches',
    element: <Navigate to="/accounting/collections" replace />,
  },
  {
    path: '/accounting/collections/reconciliation',
    element: <Navigate to="/accounting/collections?tab=reconciliation" replace />,
  },
  {
    path: '/accounting/collections/reports',
    element: <Navigate to="/accounting/collections?tab=reports" replace />,
  },
  { path: '/accounting/jev', element: <JevListPage /> },
  { path: '/accounting/jev/new', element: <JevDetailPage /> },
  { path: '/accounting/jev/:id/print', element: <PrintJevPage /> },
  { path: '/accounting/jev/:id', element: <JevDetailPage /> },
  { path: '/accounting/disbursements', element: <DisbursementListPage /> },
  { path: '/accounting/disbursements/new', element: <NewDisbursementPage /> },
  { path: '/accounting/disbursements/bir-2307', element: <Bir2307ListPage /> },
  { path: '/accounting/disbursements/:id/bir-2307', element: <Bir2307Page /> },
  { path: '/accounting/disbursements/:id/print', element: <PrintDisbursementPage /> },
  { path: '/accounting/disbursements/:id/edit', element: <NewDisbursementPage /> },
  { path: '/accounting/disbursements/:id', element: <DisbursementDetailPage /> },
  { path: '/accounting/checks', element: <CheckRegisterPage /> },
  { path: '/accounting/checks/:id/print', element: <PrintCheckPage /> },
  { path: '/accounting/reconciliations', element: <BankReconciliationPage /> },
  { path: '/accounting/reconciliations/:id', element: <BankReconciliationPage /> },
  { path: '/accounting/periods', element: <PeriodManagementPage /> },

  // Reporting outputs moved to the Reports module. Keep the old URLs working as
  // redirects so existing bookmarks / drill-down links don't break.
  { path: '/accounting/gl', element: <Navigate to="/reports/general-ledger" replace /> },
  {
    path: '/accounting/gl/trial-balance',
    element: <Navigate to="/reports/trial-balance" replace />,
  },
  { path: '/accounting/gl/subsidiary/:accountId', element: <SubsidiaryRedirect /> },
  {
    path: '/accounting/financial-statements',
    element: <Navigate to="/reports/financial-statements" replace />,
  },
];
