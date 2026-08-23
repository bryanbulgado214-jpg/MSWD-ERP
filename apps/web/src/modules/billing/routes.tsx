import { Navigate, type RouteObject } from 'react-router-dom';

import BillDetailPage from './pages/BillDetailPage';
import BillingDashboardPage from './pages/BillingDashboardPage';
import BillingPeriodPage from './pages/BillingPeriodPage';
import BillingReportsPage from './pages/BillingReportsPage';
import BillListPage from './pages/BillListPage';
import CollectionHubPage from './pages/CollectionHubPage';
import ConsumerDetailPage from './pages/ConsumerDetailPage';
import ConsumerListPage from './pages/ConsumerListPage';
import DisconnectionDetailPage from './pages/DisconnectionDetailPage';
import DisconnectionPage from './pages/DisconnectionPage';
import MeterDetailPage from './pages/MeterDetailPage';
import MeterReadingPage from './pages/MeterReadingPage';
import MeterRegistryPage from './pages/MeterRegistryPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import PaymentPage from './pages/PaymentPage';
import PrintInvoicePage from './pages/PrintInvoicePage';
import PrintOrPage from './pages/PrintOrPage';
import PrintSoaPage from './pages/PrintSoaPage';
import RateSchedulePage from './pages/RateSchedulePage';
import RemittancesPage from './pages/RemittancesPage';
import TellerDailyReportPage from './pages/TellerDailyReportPage';

export const billingRoutes: RouteObject[] = [
  { path: '/billing', element: <BillingDashboardPage /> },
  { path: '/billing/dashboard', element: <BillingDashboardPage /> },
  { path: '/billing/collection', element: <CollectionHubPage /> },
  {
    path: '/billing/other-collection',
    element: <Navigate to="/billing/collection?tab=other" replace />,
  },
  {
    path: '/billing/session',
    element: <Navigate to="/billing/collection?tab=session" replace />,
  },
  { path: '/billing/remittances', element: <RemittancesPage /> },
  { path: '/billing/consumers', element: <ConsumerListPage /> },
  { path: '/billing/consumers/:id', element: <ConsumerDetailPage /> },
  { path: '/billing/meters', element: <MeterRegistryPage /> },
  { path: '/billing/meters/:id', element: <MeterDetailPage /> },
  { path: '/billing/rate-schedules', element: <RateSchedulePage /> },
  { path: '/billing/periods', element: <BillingPeriodPage /> },
  { path: '/billing/readings', element: <MeterReadingPage /> },
  { path: '/billing/bills', element: <BillListPage /> },
  { path: '/billing/bills/:id', element: <BillDetailPage /> },
  { path: '/billing/payments', element: <PaymentPage /> },
  { path: '/billing/payments/:id', element: <PaymentDetailPage /> },
  { path: '/billing/disconnections', element: <DisconnectionPage /> },
  { path: '/billing/disconnections/:id', element: <DisconnectionDetailPage /> },
  { path: '/billing/reports', element: <BillingReportsPage /> },
  { path: '/billing/print/soa', element: <PrintSoaPage /> },
  { path: '/billing/print/or/:id', element: <PrintOrPage /> },
  { path: '/billing/print/session/:id', element: <TellerDailyReportPage /> },
  { path: '/billing/print/invoice/:id', element: <PrintInvoicePage /> },
];
