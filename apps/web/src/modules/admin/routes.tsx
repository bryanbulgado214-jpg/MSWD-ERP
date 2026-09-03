import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';

import { AdminLayout } from './pages/AdminLayout';
import { AuditTrailPage } from './pages/AuditTrailPage';
import { DemoDataPage } from './pages/DemoDataPage';
import { DistrictProfilePage } from './pages/DistrictProfilePage';
import { RoleDetailPage } from './pages/RoleDetailPage';
import { RoleListPage } from './pages/RoleListPage';
import { SignatoriesPage } from './pages/SignatoriesPage';
import { UserListPage } from './pages/UserListPage';

export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="/admin/users" replace /> },
      { path: 'users', element: <UserListPage /> },
      { path: 'roles', element: <RoleListPage /> },
      { path: 'roles/:id', element: <RoleDetailPage /> },
      { path: 'audit-trail', element: <AuditTrailPage /> },
      { path: 'district-profile', element: <DistrictProfilePage /> },
      { path: 'signatories', element: <SignatoriesPage /> },
      { path: 'demo-data', element: <DemoDataPage /> },
    ],
  },
];
