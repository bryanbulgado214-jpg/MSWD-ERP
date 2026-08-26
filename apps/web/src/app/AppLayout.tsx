import { useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from './auth';
import { ChangePasswordModal } from './ChangePasswordModal';
import { hasModuleAccess, isAccountantHome, isCashierHome } from './module-access';
import { NotificationBell } from './NotificationBell';
import './app-layout.css';

const MODULE_NAV = [
  { to: '/budgeting', label: 'Budgeting', module: 'budgeting' as const },
  { to: '/procurement', label: 'Procurement', module: 'procurement' as const },
  { to: '/inventory', label: 'Inventory', module: 'inventory' as const },
  { to: '/billing', label: 'Billing & Collection', module: 'billing' as const },
  { to: '/hr', label: 'HR & Payroll', module: 'hr' as const },
  { to: '/work-orders', label: 'Work Orders', module: 'workorder' as const },
  { to: '/complaints', label: 'Complaints', module: 'complaint' as const },
  { to: '/assets', label: 'Assets', module: 'asset' as const },
  { to: '/accounting', label: 'Accounting', module: 'accounting' as const },
  { to: '/reports', label: 'Reports', module: 'reports' as const },
  { to: '/admin', label: 'Admin', module: 'admin' as const },
];

// Modules that exist in the codebase but are not part of the initial LIVE rollout
// (Cashiering + Accounting + Reports only). They are hidden in production builds
// until we configure them; the dev/demo build still shows every module. Remove a
// module from this set to bring it into the live navigation.
const LIVE_HIDDEN_MODULES = new Set<string>([
  'budgeting',
  'procurement',
  'inventory',
  'hr',
  'workorder',
  'complaint',
  'asset',
]);

export function AppLayout() {
  const { user, organization, loading, logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQ, setSearchQ] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  // Publish the left edge of the top-nav tab row as --subnav-left so the vertical
  // sub-nav rails (and page content) line up under the first header tab, on every
  // page, regardless of viewport width or brand width.
  const linksRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function measure() {
      const el = linksRef.current;
      if (el) {
        const left = Math.round(el.getBoundingClientRect().left);
        document.documentElement.style.setProperty('--subnav-left', `${left}px`);
      }
    }
    measure();
    window.addEventListener('resize', measure);
    // The brand (and thus the tab row's left) shifts once the web font loads —
    // re-measure then so the rails don't stay pinned to the fallback position.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [loading, user, organization?.name]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // The collection cashier sees only two tabs: Cashiering (billing, relabeled —
  // with DVs & Checks folded into its sub-nav) and Reports. The Accounting tab is
  // hidden for them; its disbursement screens live under Cashiering instead.
  const cashierHome = isCashierHome(permissions);
  const visibleLinks = MODULE_NAV.filter(
    (mod) =>
      hasModuleAccess(permissions, mod.module) &&
      !(cashierHome && mod.module === 'accounting') &&
      !(import.meta.env.PROD && LIVE_HIDDEN_MODULES.has(mod.module)),
  ).map((mod) => (cashierHome && mod.module === 'billing' ? { ...mod, label: 'Cashiering' } : mod));
  // The accountant's and cashier's homes are their own dashboards — hide the
  // generic Home tab for them.
  const showHome = !isAccountantHome(permissions) && !cashierHome;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleSwitchUser() {
    logout();
    navigate('/login');
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = searchQ.trim();
    if (v) {
      navigate(`/search?q=${encodeURIComponent(v)}`);
      setSearchQ('');
    }
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        {import.meta.env.DEV && (
          <div className="app-demo-banner" role="note">
            DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS
          </div>
        )}
        <nav className="app-nav">
          <div className="app-nav__left">
            <Link
              to="/"
              className="app-nav__brand"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <img
                src="/aquabooks-mark.png"
                alt=""
                style={{ height: 30, width: 'auto', display: 'block' }}
              />
              AquaBooks
              {organization?.name ? (
                <span className="app-nav__org"> · {organization.name}</span>
              ) : null}
            </Link>
            <div className="app-nav__links" ref={linksRef}>
              {showHome && (
                <Link
                  to="/"
                  className={`app-nav__link${location.pathname === '/' ? ' app-nav__link--active' : ''}`}
                >
                  Home
                </Link>
              )}
              {visibleLinks.map((link) => {
                // For the cashier, the Cashiering (billing) tab stays active on the
                // disbursement screens they reach under /accounting.
                const active =
                  location.pathname.startsWith(link.to) ||
                  (cashierHome &&
                    link.module === 'billing' &&
                    location.pathname.startsWith('/accounting'));
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`app-nav__link${active ? ' app-nav__link--active' : ''}`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="app-nav__user">
            <form className="app-nav__search" onSubmit={submitSearch} role="search">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search…"
                aria-label="Quick search"
              />
              <button type="submit" aria-label="Search">
                🔍
              </button>
            </form>
            <NotificationBell />
            <div className="app-nav__usermenu">
              <button
                type="button"
                className="app-nav__userbtn"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                title="Account"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                {user.fullName || user.username}
                <span className="app-nav__caret" aria-hidden="true">
                  ▼
                </span>
              </button>
              {userMenuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1500 }}
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="app-nav__menu" role="menu">
                    <div className="app-nav__menu-head">
                      <div className="app-nav__menu-name">{user.fullName || user.username}</div>
                      <div className="app-nav__menu-sub">@{user.username}</div>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className="app-nav__menu-item"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowChangePw(true);
                      }}
                    >
                      Change password
                    </button>
                  </div>
                </>
              )}
            </div>
            {import.meta.env.DEV && (
              <button type="button" className="app-nav__btn" onClick={handleSwitchUser}>
                Switch User
              </button>
            )}
            <button
              type="button"
              className="app-nav__btn app-nav__btn--logout"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
