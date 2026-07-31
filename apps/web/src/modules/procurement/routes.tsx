import type { RouteObject } from 'react-router-dom';

import { AuditTrailPage } from './pages/AuditTrailPage';
import { DelegationPage } from './pages/DelegationPage';
import { DvDetailPage } from './pages/DvDetailPage';
import { DvListPage } from './pages/DvListPage';
import { NewDvPage } from './pages/NewDvPage';
import { PrintDvPage } from './pages/PrintDvPage';
import { InspectionDetailPage } from './pages/InspectionDetailPage';
import { InspectionListPage } from './pages/InspectionListPage';
import { NewInspectionPage } from './pages/NewInspectionPage';
import { CafDetailPage } from './pages/CafDetailPage';
import { CafListPage } from './pages/CafListPage';
import { CreatePurchaseRequestPage } from './pages/CreatePurchaseRequestPage';
import { EditPurchaseRequestPage } from './pages/EditPurchaseRequestPage';
import { OrsDetailPage } from './pages/OrsDetailPage';
import { OrsListPage } from './pages/OrsListPage';
import { PurchaseOrderDetailPage } from './pages/PurchaseOrderDetailPage';
import { PurchaseOrderListPage } from './pages/PurchaseOrderListPage';
import { PpmpDataEntryPage } from './pages/PpmpDataEntryPage';
import { PrintCafPage } from './pages/PrintCafPage';
import { PrintOrsPage } from './pages/PrintOrsPage';
import { PrintPurchaseOrderPage } from './pages/PrintPurchaseOrderPage';
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
    path: '/procurement/purchase-orders/:id/print',
    element: <PrintPurchaseOrderPage />,
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
    path: '/procurement/cafs/:id/print',
    element: <PrintCafPage />,
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
    path: '/procurement/ors/:id/print',
    element: <PrintOrsPage />,
  },
  {
    path: '/procurement/inspections',
    element: <InspectionListPage />,
  },
  {
    path: '/procurement/inspections/new',
    element: <NewInspectionPage />,
  },
  {
    path: '/procurement/inspections/:id',
    element: <InspectionDetailPage />,
  },
  {
    path: '/procurement/dvs',
    element: <DvListPage />,
  },
  {
    path: '/procurement/dvs/new',
    element: <NewDvPage />,
  },
  {
    path: '/procurement/dvs/:id',
    element: <DvDetailPage />,
  },
  {
    path: '/procurement/dvs/:id/print',
    element: <PrintDvPage />,
  },
  {
    path: '/procurement/delegations',
    element: <DelegationPage />,
  },
  {
    path: '/procurement/audit-trail',
    element: <AuditTrailPage />,
  },
];
