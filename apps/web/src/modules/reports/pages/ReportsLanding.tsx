import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

import { accessibleReportGroups } from './ReportsSubNav';

/**
 * Reports home — a grid of shortcut cards for every report the user can open,
 * grouped by category. No auto-redirect into a specific report, so opening the
 * Reports tab lands here with the sidebar categories collapsed.
 */
export function ReportsLanding() {
  const { permissions } = useAuth();
  const groups = accessibleReportGroups(permissions);

  if (groups.length === 0) {
    return (
      <div className="reports-empty" style={{ padding: 24 }}>
        You do not have access to any reports.
      </div>
    );
  }

  return (
    <div className="reports-home">
      <p className="reports-home__intro">Choose a report to open.</p>
      {groups.map((g) => (
        <section key={g.label} className="reports-home__section">
          <h2 className="reports-home__cat">{g.label}</h2>
          <div className="reports-home__grid">
            {g.items.map((item) => (
              <Link key={item.to} to={item.to} className="reports-home__card">
                <span className="reports-home__icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="reports-home__text">
                  <span className="reports-home__label">{item.label}</span>
                  <span className="reports-home__blurb">{item.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
