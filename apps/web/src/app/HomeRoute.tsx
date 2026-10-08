import { Navigate } from 'react-router-dom';

import { useAuth } from './auth';
import { DashboardPage } from './DashboardPage';
import { isAccountantHome, isCashierHome, isProcurementHome, isSectionHeadHome } from './module-access';
import { SectionHeadDashboard } from './SectionHeadDashboard';

/**
 * The "/" landing. An accountant has no generic Home — their command center is
 * the Accounting Dashboard, so send them straight there (covers login and the
 * brand-logo link). A collection cashier lands on the Cashiering Dashboard.
 * Everyone else gets the Home dashboard.
 */
export function HomeRoute() {
  const { permissions, loading } = useAuth();
  if (loading) return null;
  if (isAccountantHome(permissions)) return <Navigate to="/accounting/dashboard" replace />;
  if (isCashierHome(permissions)) return <Navigate to="/billing/dashboard" replace />;
  if (isProcurementHome(permissions)) return <Navigate to="/procurement/dashboard" replace />;
  if (isSectionHeadHome(permissions)) return <SectionHeadDashboard />;
  return <DashboardPage />;
}
