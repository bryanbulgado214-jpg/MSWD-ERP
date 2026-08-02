import type { RouteObject } from 'react-router-dom';

import WorkOrderDashboardPage from './pages/WorkOrderDashboardPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderEditPage from './pages/WorkOrderEditPage';
import WorkOrderListPage from './pages/WorkOrderListPage';
import WorkOrderNewPage from './pages/WorkOrderNewPage';
import WorkOrderPrintPage from './pages/WorkOrderPrintPage';
import WorkOrderReportsPage from './pages/WorkOrderReportsPage';

const workOrderRoutes: RouteObject[] = [
  { index: true, element: <WorkOrderListPage /> },
  { path: 'dashboard', element: <WorkOrderDashboardPage /> },
  { path: 'reports', element: <WorkOrderReportsPage /> },
  { path: 'new', element: <WorkOrderNewPage /> },
  { path: ':id', element: <WorkOrderDetailPage /> },
  { path: ':id/edit', element: <WorkOrderEditPage /> },
  { path: ':id/print', element: <WorkOrderPrintPage /> },
];

export default workOrderRoutes;
