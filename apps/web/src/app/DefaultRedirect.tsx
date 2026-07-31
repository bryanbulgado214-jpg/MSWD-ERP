import { Navigate } from 'react-router-dom';

import { useAuth } from './auth';
import { hasModuleAccess } from './module-access';

export function DefaultRedirect() {
  const { permissions, loading } = useAuth();
  if (loading) return null;

  if (hasModuleAccess(permissions, 'budgeting')) return <Navigate to="/budgeting" replace />;
  if (hasModuleAccess(permissions, 'procurement')) return <Navigate to="/procurement" replace />;
  return <Navigate to="/no-access" replace />;
}
