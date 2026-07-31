import type { RouteObject } from 'react-router-dom';

import { AuditTrailPage } from './pages/AuditTrailPage';
import { CafDetailPage } from './pages/CafDetailPage';
import { CafListPage } from './pages/CafListPage';
import { CreatePurchaseRequestPage } from './pages/CreatePurchaseRequestPage';
import { EditPurchaseRequestPage } from './pages/EditPurchaseRequestPage';
import { OrsDetailPage } from './pages/OrsDetailPage';
import { OrsListPage } from './pages/OrsListPage';
import { PurchaseOrderDetailPage } from './pages/PurchaseOrderDetailPage';
import { PurchaseOrderListPage } from './pages/PurchaseOrderListPage';
import { PpmpDataEntryPage } from './pages/PpmpDataEntryPage';
import { PrintPurchaseRequestPage } from './pages/PrintPurchaseRequestPage';
import { PurchaseRequestDetailPage } from './pages/PurchaseRequestDetailPage';
import { PurchaseRequestListPage } from './pages/PurchaseRequestListPage';
import { SupplierListPage } from './pages/SupplierListPage';

export const procurementRoutes: RouteObject[] = [
  {
    path: '/procurement',
    element: <PurchaseRequestListPage />,
  },
  {
    path: '/procurement/purchase-requests/new',
    element: <CreatePurchaseRequestPage />,
  },
  {
    path: '/procurement/purchase-requests/:id',
    element: <PurchaseRequestDetailPage />,
  },
  {
    path: '/procurement/purchase-requests/:id/edit',
    element: <EditPurchaseRequestPage />,
  },
  {
    path: '/procurement/purchase-requests/:id/print',
    element: <PrintPurchaseRequestPage />,
  },
  {
    path: '/procurement/ppmp-items',
    element: <PpmpDataEntryPage />,
  },
  {
    path: '/procurement/purchase-orders',
    element: <PurchaseOrderListPage />,
  },
  {
    path: '/procurement/purchase-orders/:id',
    element: <PurchaseOrderDetailPage />,
  },
  {
    path: '/procurement/suppliers',
    element: <SupplierListPage />,
  },
  {
    path: '/procurement/cafs',
    element: <CafListPage />,
  },
  {
    path: '/procurement/cafs/:id',
    element: <CafDetailPage />,
  },
  {
    path: '/procurement/ors',
    element: <OrsListPage />,
  },
  {
    path: '/procurement/ors/:id',
    element: <OrsDetailPage />,
  },
  {
    path: '/procurement/audit-trail',
    element: <AuditTrailPage />,
  },
];
