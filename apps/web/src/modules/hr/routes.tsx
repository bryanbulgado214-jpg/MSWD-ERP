import type { RouteObject } from 'react-router-dom';

import CompensationPage from './pages/CompensationPage';
import DtrPage from './pages/DtrPage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import EmployeeListPage from './pages/EmployeeListPage';
import EmployeeNewPage from './pages/EmployeeNewPage';
import HrDashboardPage from './pages/HrDashboardPage';
import LeaveListPage from './pages/LeaveListPage';
import LeaveNewPage from './pages/LeaveNewPage';
import PayrollPage from './pages/PayrollPage';
import PositionListPage from './pages/PositionListPage';
import HrReportsPage from './pages/HrReportsPage';
import RemittancePage from './pages/RemittancePage';

const hrRoutes: RouteObject[] = [
  { index: true, element: <HrDashboardPage /> },
  { path: 'employees', element: <EmployeeListPage /> },
  { path: 'employees/new', element: <EmployeeNewPage /> },
  { path: 'employees/:id', element: <EmployeeDetailPage /> },
  { path: 'positions', element: <PositionListPage /> },
  { path: 'leave', element: <LeaveListPage /> },
  { path: 'leave/new', element: <LeaveNewPage /> },
  { path: 'dtr', element: <DtrPage /> },
  { path: 'compensation', element: <CompensationPage /> },
  { path: 'payroll', element: <PayrollPage /> },
  { path: 'remittances', element: <RemittancePage /> },
  { path: 'reports', element: <HrReportsPage /> },
];

export default hrRoutes;
