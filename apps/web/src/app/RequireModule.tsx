import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from './auth';
import { hasModuleAccess, type MODULE_GATES } from './module-access';

interface RequireModuleProps {
  module: keyof typeof MODULE_GATES;
  fallback?: string;
}

export function RequireModule({ module, fallback = '/no-access' }: RequireModuleProps) {
  const { permissions, loading } = useAuth();
  if (loading) return null;
  if (!hasModuleAccess(permissions, module)) return <Navigate to={fallback} replace />;
  return <Outlet />;
}
