import { Outlet } from 'react-router-dom';

import { ReportsSubNav } from './ReportsSubNav';
import './reports.css';

export function ReportsLayout() {
  return (
    <div className="reports-page">
      <h1>Reports &amp; Analytics</h1>
      <ReportsSubNav />
      <Outlet />
    </div>
  );
}
