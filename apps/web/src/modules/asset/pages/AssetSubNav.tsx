import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/assets', label: 'Dashboard', match: ['/assets'], exact: true },
  { to: '/assets/categories', label: 'Categories', match: ['/assets/categories'] },
  { to: '/assets/depreciation', label: 'Depreciation', match: ['/assets/depreciation'] },
  { to: '/assets/transfers', label: 'Transfers', match: ['/assets/transfers'] },
  { to: '/assets/register', label: 'Register', match: ['/assets/register'] },
  { to: '/assets/reports', label: 'Reports', match: ['/assets/reports'] },
];

export default function AssetSubNav() {
  const { pathname } = useLocation();

  return (
    <nav className="am-subnav">
      {LINKS.map((link) => {
        const active = link.exact
          ? link.match.some((m) => pathname === m)
          : link.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`am-subnav__link${active ? ' am-subnav__link--active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
