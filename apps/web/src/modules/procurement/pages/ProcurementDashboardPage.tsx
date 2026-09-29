import { useAuth } from '../../../app/auth';
// The workspace panel (Pending Actions + Notes + Upcoming Due Dates) is a
// per-user widget — its endpoints are authenticated-only, not accounting-scoped
// (see accounting-workspace.controller). Reuse it here so the procurement
// officer gets the same command-center as the accountant and cashier, without
// duplicating the panel or changing the accounting pages. The accounting styles
// are bundled globally, so importing the workspace is enough.
import AccountantWorkspace from '../../accounting/pages/AccountantWorkspace';

import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

export function ProcurementDashboardPage() {
  const { organization } = useAuth();
  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <h1 style={{ margin: 0 }}>Procurement Dashboard</h1>
        {organization?.name && (
          <span style={{ color: '#667085', fontSize: 13 }}>{organization.name}</span>
        )}
      </div>
      <AccountantWorkspace />
    </div>
  );
}
