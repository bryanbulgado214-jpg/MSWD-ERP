import { Link, Outlet, useLocation } from 'react-router-dom';

import '../workorders.css';

// Staff Availability is a hub with two tabs: the staff master list and the
// teams & personnel roster (moved here from its own page). The Teams tab is
// shown to everyone — the page itself is read-only for users without
// workorder.team.manage.
export default function StaffHubLayout() {
  const { pathname } = useLocation();

  const tabs = [
    { to: '/work-orders/staff', label: 'Staff Availability', exact: true },
    { to: '/work-orders/staff/teams', label: 'Teams & Personnel' },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === `${to}/` : pathname.startsWith(to);

  return (
    <>
      <div className="wo-page" style={{ paddingTop: '1.25rem', paddingBottom: 0 }}>
        <nav className="wo-tabs">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`wo-tab${isActive(t.to, t.exact) ? ' wo-tab--active' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  );
}
