import type { RouteObject } from 'react-router-dom';

import WorkOrdersLayout from './WorkOrdersLayout';
import WorkOrderDashboardPage from './pages/WorkOrderDashboardPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderEditPage from './pages/WorkOrderEditPage';
import WorkOrderListPage from './pages/WorkOrderListPage';
import WorkOrderNewPage from './pages/WorkOrderNewPage';
import StaffAvailabilityPage from './pages/StaffAvailabilityPage';
import WorkOrderPrintPage from './pages/WorkOrderPrintPage';
import WorkOrderReportsPage from './pages/WorkOrderReportsPage';
import WorkOrderTeamsPage from './pages/WorkOrderTeamsPage';
import CcfListPage from './pages/CcfListPage';
import CcfNewPage from './pages/CcfNewPage';
import CcfDetailPage from './pages/CcfDetailPage';
import CcfPrintPage from './pages/CcfPrintPage';

const workOrderRoutes: RouteObject[] = [
  {
    // The module shell: fixed left-rail sub-nav around every page (except print).
    element: <WorkOrdersLayout />,
    children: [
      { index: true, element: <WorkOrderListPage /> },
      { path: 'dashboard', element: <WorkOrderDashboardPage /> },
      { path: 'teams', element: <WorkOrderTeamsPage /> },
      { path: 'staff', element: <StaffAvailabilityPage /> },
      { path: 'ccf', element: <CcfListPage /> },
      { path: 'ccf/new', element: <CcfNewPage /> },
      { path: 'ccf/:id', element: <CcfDetailPage /> },
      { path: 'new', element: <WorkOrderNewPage /> },
      { path: ':id', element: <WorkOrderDetailPage /> },
      { path: ':id/edit', element: <WorkOrderEditPage /> },
    ],
  },
  // Reports is its own navbar tab (not a Work Order sub-page), so it sits
  // outside the module shell and shows no left rail.
  { path: 'reports', element: <WorkOrderReportsPage /> },
  // Print pages render full-bleed (no left rail).
  { path: 'ccf/:id/print', element: <CcfPrintPage /> },
  { path: ':id/print', element: <WorkOrderPrintPage /> },
];

export default workOrderRoutes;
