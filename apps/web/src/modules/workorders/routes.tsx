import type { RouteObject } from 'react-router-dom';

import WorkOrderDashboardPage from './pages/WorkOrderDashboardPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderEditPage from './pages/WorkOrderEditPage';
import WorkOrderListPage from './pages/WorkOrderListPage';
import WorkOrderNewPage from './pages/WorkOrderNewPage';
import StaffAvailabilityPage from './pages/StaffAvailabilityPage';
import WorkOrderPrintPage from './pages/WorkOrderPrintPage';
import WorkOrderReportsPage from './pages/WorkOrderReportsPage';
import WorkOrderTeamsPage from './pages/WorkOrderTeamsPage';

const workOrderRoutes: RouteObject[] = [
  { index: true, element: <WorkOrderListPage /> },
  { path: 'dashboard', element: <WorkOrderDashboardPage /> },
  { path: 'reports', element: <WorkOrderReportsPage /> },
  { path: 'teams', element: <WorkOrderTeamsPage /> },
  { path: 'staff', element: <StaffAvailabilityPage /> },
  { path: 'new', element: <WorkOrderNewPage /> },
  { path: ':id', element: <WorkOrderDetailPage /> },
  { path: ':id/edit', element: <WorkOrderEditPage /> },
  { path: ':id/print', element: <WorkOrderPrintPage /> },
];

export default workOrderRoutes;
