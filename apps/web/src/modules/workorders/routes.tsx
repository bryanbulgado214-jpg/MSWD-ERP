import type { RouteObject } from 'react-router-dom';

import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderListPage from './pages/WorkOrderListPage';
import WorkOrderNewPage from './pages/WorkOrderNewPage';

const workOrderRoutes: RouteObject[] = [
  { index: true, element: <WorkOrderListPage /> },
  { path: 'new', element: <WorkOrderNewPage /> },
  { path: ':id', element: <WorkOrderDetailPage /> },
];

export default workOrderRoutes;
