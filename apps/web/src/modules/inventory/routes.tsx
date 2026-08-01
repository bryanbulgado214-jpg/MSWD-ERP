import type { RouteObject } from 'react-router-dom';

import AccountabilityListPage from './pages/AccountabilityListPage';
import DisposalListPage from './pages/DisposalListPage';
import ItemCatalogPage from './pages/ItemCatalogPage';
import PhysicalCountListPage from './pages/PhysicalCountListPage';
import PropertyRecordListPage from './pages/PropertyRecordListPage';
import RisListPage from './pages/RisListPage';
import StockReceiptListPage from './pages/StockReceiptListPage';

export const inventoryRoutes: RouteObject[] = [
  { path: '/inventory', element: <ItemCatalogPage /> },
  { path: '/inventory/stock-receipts', element: <StockReceiptListPage /> },
  { path: '/inventory/ris', element: <RisListPage /> },
  { path: '/inventory/property-records', element: <PropertyRecordListPage /> },
  { path: '/inventory/accountability', element: <AccountabilityListPage /> },
  { path: '/inventory/physical-counts', element: <PhysicalCountListPage /> },
  { path: '/inventory/disposal', element: <DisposalListPage /> },
];
