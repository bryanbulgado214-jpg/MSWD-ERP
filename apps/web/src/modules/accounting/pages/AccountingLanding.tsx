import { Navigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

import { accessibleAccountingLinks } from './AccountingSubNav';

/**
 * Entry point for the Accounting module. Redirects to the first tab the user can
 * actually open, so a cashier (Disbursement Vouchers / Checks only) never lands
 * on a page they lack permission for.
 */
export function AccountingLanding() {
  const { permissions } = useAuth();
  const links = accessibleAccountingLinks(permissions);
  if (links.length > 0) {
    return <Navigate to={links[0]!.to} replace />;
  }
  return (
    <div className="acct-page" style={{ padding: 32, color: '#667085' }}>
      You do not have access to any accounting screens.
    </div>
  );
}
