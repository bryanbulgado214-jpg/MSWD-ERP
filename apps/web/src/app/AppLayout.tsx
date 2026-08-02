import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from './auth';
import { hasModuleAccess } from './module-access';
import { NotificationBell } from './NotificationBell';
import './app-layout.css';

const MODULE_NAV = [
  { to: '/budgeting', label: 'Budgeting', module: 'budgeting' as const },
  { to: '/procurement', label: 'Procurement', module: 'procurement' as const },
  { to: '/inventory', label: 'Inventory', module: 'inventory' as const },
  { to: '/billing', label: 'Billing', module: 'billing' as const },
  { to: '/hr', label: 'HR & Payroll', module: 'hr' as const },
  { to: '/work-orders', label: 'Work Orders', module: 'workorder' as const },
  { to: '/complaints', label: 'Complaints', module: 'complaint' as const },
  { to: '/accounting', label: 'Accounting', module: 'accounting' as const },
  { to: '/reports', label: 'Reports', module: 'reports' as const },
  { to: '/admin', label: 'Admin', module: 'admin' as const },
];

export function AppLayout() {
  const { user, loading, logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const visibleLinks = MODULE_NAV.filter((mod) => hasModuleAccess(permissions, mod.module));

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleSwitchUser() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="app-nav__left">
          <Link to="/" className="app-nav__brand" style={{ textDecoration: 'none', color: 'inherit' }}>MSWD ERP</Link>
          <div className="app-nav__links">
            <Link
              to="/"
              className={`app-nav__link${location.pathname === '/' ? ' app-nav__link--active' : ''}`}
            >
              Home
            </Link>
            {visibleLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`app-nav__link${location.pathname.startsWith(link.to) ? ' app-nav__link--active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="app-nav__user">
          <NotificationBell />
          <span className="app-nav__username">{user.username}</span>
          <button type="button" className="app-nav__btn" onClick={handleSwitchUser}>Switch User</button>
          <button type="button" className="app-nav__btn app-nav__btn--logout" onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
