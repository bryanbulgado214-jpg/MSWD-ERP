import type { RouteObject } from 'react-router-dom';

import AssetCategoriesPage from './pages/AssetCategoriesPage';
import AssetDashboardPage from './pages/AssetDashboardPage';
import AssetRegisterPage from './pages/AssetRegisterPage';
import AssetReportsPage from './pages/AssetReportsPage';
import AssetTransferDetailPage from './pages/AssetTransferDetailPage';
import AssetTransfersPage from './pages/AssetTransfersPage';
import DepreciationRunDetailPage from './pages/DepreciationRunDetailPage';
import DepreciationRunsPage from './pages/DepreciationRunsPage';

const assetRoutes: RouteObject[] = [
  { index: true, element: <AssetDashboardPage /> },
  { path: 'categories', element: <AssetCategoriesPage /> },
  { path: 'depreciation', element: <DepreciationRunsPage /> },
  { path: 'depreciation/:id', element: <DepreciationRunDetailPage /> },
  { path: 'transfers', element: <AssetTransfersPage /> },
  { path: 'transfers/:id', element: <AssetTransferDetailPage /> },
  { path: 'register', element: <AssetRegisterPage /> },
  { path: 'reports', element: <AssetReportsPage /> },
];

export default assetRoutes;
