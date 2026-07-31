import { Navigate } from 'react-router-dom';

import { BudgetReportPage } from './pages/BudgetReportPage';
import { ProcurementReportPage } from './pages/ProcurementReportPage';
import { ReportsLayout } from './pages/ReportsLayout';
import { SupplierReportPage } from './pages/SupplierReportPage';

export const reportsRoutes = [
  {
    path: '/reports',
    element: <ReportsLayout />,
    children: [
      { index: true, element: <Navigate to="/reports/procurement" replace /> },
      { path: 'procurement', element: <ProcurementReportPage /> },
      { path: 'budget', element: <BudgetReportPage /> },
      { path: 'suppliers', element: <SupplierReportPage /> },
    ],
  },
];
