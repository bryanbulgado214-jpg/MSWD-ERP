import type { RouteObject } from 'react-router-dom';

import ComplaintDashboardPage from './pages/ComplaintDashboardPage';
import ComplaintDetailPage from './pages/ComplaintDetailPage';
import ComplaintListPage from './pages/ComplaintListPage';
import ComplaintNewPage from './pages/ComplaintNewPage';
import ComplaintReportsPage from './pages/ComplaintReportsPage';

const complaintRoutes: RouteObject[] = [
  { index: true, element: <ComplaintListPage /> },
  { path: 'dashboard', element: <ComplaintDashboardPage /> },
  { path: 'reports', element: <ComplaintReportsPage /> },
  { path: 'new', element: <ComplaintNewPage /> },
  { path: ':id', element: <ComplaintDetailPage /> },
];

export default complaintRoutes;
