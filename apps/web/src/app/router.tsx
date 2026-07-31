import { createBrowserRouter } from 'react-router-dom';

import { budgetingRoutes } from '../modules/budgeting/routes';
import { procurementRoutes } from '../modules/procurement/routes';
import { AppLayout } from './AppLayout';
import { DashboardPage } from './DashboardPage';
import { LoginPage } from './LoginPage';
import { NoAccessPage } from './NoAccessPage';
import { RequireModule } from './RequireModule';
import { RootLayout } from './RootLayout';

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
            element: <DashboardPage />,
          },
          {
            path: '/no-access',
            element: <NoAccessPage />,
          },
          {
            element: <RequireModule module="budgeting" />,
            children: budgetingRoutes,
          },
          {
            element: <RequireModule module="procurement" />,
            children: procurementRoutes,
          },
        ],
      },
    ],
  },
]);
