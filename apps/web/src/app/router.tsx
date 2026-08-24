import { createBrowserRouter } from 'react-router-dom';

import { accountingRoutes } from '../modules/accounting/routes';
import { adminRoutes } from '../modules/admin/routes';
import assetRoutes from '../modules/asset/routes';
import { billingRoutes } from '../modules/billing/routes';
import { budgetingRoutes } from '../modules/budgeting/routes';
import complaintRoutes from '../modules/complaints/routes';
import hrRoutes from '../modules/hr/routes';
import { inventoryRoutes } from '../modules/inventory/routes';
import { procurementRoutes } from '../modules/procurement/routes';
import { reportsRoutes } from '../modules/reports/routes';
import workOrderRoutes from '../modules/workorders/routes';

import { AppLayout } from './AppLayout';
import { HomeRoute } from './HomeRoute';
import { LoginPage } from './LoginPage';
import { NoAccessPage } from './NoAccessPage';
import { RequireModule } from './RequireModule';
import { RootLayout } from './RootLayout';
import { SearchResultsPage } from './SearchResultsPage';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            element: <HomeRoute />,
          },
          {
            path: '/search',
            element: <SearchResultsPage />,
          },
          {
            path: '/no-access',
            element: <NoAccessPage />,
          },
          {
            element: <RequireModule module="reports" />,
            children: reportsRoutes,
          },
          {
            element: <RequireModule module="admin" />,
            children: adminRoutes,
          },
          {
            element: <RequireModule module="budgeting" />,
            children: budgetingRoutes,
          },
          {
            element: <RequireModule module="procurement" />,
            children: procurementRoutes,
          },
          {
            element: <RequireModule module="inventory" />,
            children: inventoryRoutes,
          },
          {
            element: <RequireModule module="billing" />,
            children: billingRoutes,
          },
          {
            path: '/hr',
            element: <RequireModule module="hr" />,
            children: hrRoutes,
          },
          {
            path: '/work-orders',
            element: <RequireModule module="workorder" />,
            children: workOrderRoutes,
          },
          {
            path: '/complaints',
            element: <RequireModule module="complaint" />,
            children: complaintRoutes,
          },
          {
            element: <RequireModule module="accounting" />,
            children: accountingRoutes,
          },
          {
            path: '/assets',
            element: <RequireModule module="asset" />,
            children: assetRoutes,
          },
        ],
      },
    ],
  },
]);
