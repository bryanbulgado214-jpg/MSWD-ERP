import { Outlet } from 'react-router-dom';

import WorkOrdersSubNav from './WorkOrdersSubNav';

// Shell for the Work Order module: the fixed left rail plus the active page.
export default function WorkOrdersLayout() {
  return (
    <>
      <WorkOrdersSubNav />
      <Outlet />
    </>
  );
}
