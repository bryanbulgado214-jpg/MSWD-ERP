import { Outlet } from 'react-router-dom';

// Each admin page renders its own <AdminSubNav /> inside its .admin-page
// wrapper (consistent with the other modules and the vertical sidebar layout).
export function AdminLayout() {
  return <Outlet />;
}
