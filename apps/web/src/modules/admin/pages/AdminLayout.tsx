import { Outlet } from 'react-router-dom';
import { AdminSubNav } from './AdminSubNav';

export function AdminLayout() {
  return (
    <div>
      <AdminSubNav />
      <Outlet />
    </div>
  );
}
