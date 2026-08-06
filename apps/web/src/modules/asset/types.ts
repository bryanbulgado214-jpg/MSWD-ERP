export type DepreciationRunStatus = 'draft' | 'posted' | 'voided';
export type AssetTransferStatus = 'pending' | 'approved' | 'completed' | 'rejected';
export type DepreciationMethod = 'straight_line';

export const DEPR_RUN_STATUS_LABELS: Record<DepreciationRunStatus, string> = {
  draft: 'Draft', posted: 'Posted', voided: 'Voided',
};
export const TRANSFER_STATUS_LABELS: Record<AssetTransferStatus, string> = {
  pending: 'Pending', approved: 'Approved', completed: 'Completed', rejected: 'Rejected',
};

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  depreciationMethod: string;
  defaultUsefulLife: number | null;
  ppeAccountCode: string | null;
  accumDeprAccountCode: string | null;
  deprExpenseAccountCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DepreciationRun {
  id: string;
  runNumber: string;
  periodMonth: number;
  periodYear: number;
  status: string;
  totalDepreciation: string;
  assetCount: number;
  jevId: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  version: number;
  createdAt: string;
  poster: { id: string; username: string } | null;
  voider: { id: string; username: string } | null;
  creator: { id: string; username: string } | null;
  jev: { id: string; jevNumber: string } | null;
  items?: DepreciationRunItem[];
}

export interface DepreciationRunItem {
  id: string;
  depreciationAmount: string;
  accumBefore: string;
  accumAfter: string;
  bookValueBefore: string;
  bookValueAfter: string;
  propertyRecord: {
    id: string;
    propertyNumber: string;
    description: string;
    acquisitionCost: string;
    inventoryItem: { description: string };
  };
  assetCategory: { id: string; code: string; name: string } | null;
}

export interface AssetTransfer {
  id: string;
  transferNumber: string;
  propertyRecordId: string;
  transferDate: string;
  reason: string | null;
  status: string;
  approvedAt: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  propertyRecord: {
    id: string;
    propertyNumber: string;
    description: string;
    inventoryItem?: { description: string };
    acquisitionCost?: string;
    bookValue?: string;
    condition?: string;
    assetCategory?: { id: string; code: string; name: string } | null;
  };
  fromUser: { id: string; username: string } | null;
  toUser: { id: string; username: string };
  fromLocation: { id: string; name: string } | null;
  toLocation: { id: string; name: string } | null;
  approver: { id: string; username: string } | null;
  creator: { id: string; username: string } | null;
}

export interface AssetRegisterItem {
  id: string;
  propertyNumber: string;
  description: string;
  dateAcquired: string;
  acquisitionCost: string;
  salvageValue: string | null;
  estimatedUsefulLife: number | null;
  monthlyDepreciation: string | null;
  accumulatedDepreciation: string;
  bookValue: string | null;
  condition: string;
  isDisposed: boolean;
  inventoryItem: { itemCode: string; description: string };
  assetCategory: { id: string; code: string; name: string } | null;
  location: { id: string; name: string } | null;
  accountableUser: { id: string; username: string } | null;
}

export interface DepreciationScheduleItem {
  id: string;
  propertyNumber: string;
  description: string;
  itemName: string;
  category: string;
  acquisitionCost: number;
  salvageValue: number;
  estimatedUsefulLife: number | null;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  remainingLife: number | null;
}

export interface AssetDashboard {
  totalAssets: number;
  disposedCount: number;
  pendingTransfers: number;
  totalAcquisitionCost: number;
  totalAccumulatedDepreciation: number;
  totalBookValue: number;
  categoryCounts: Array<{ id: string; code: string; name: string; count: number }>;
  recentTransfers: Array<{
    id: string;
    transferNumber: string;
    status: string;
    createdAt: string;
    propertyRecord: { propertyNumber: string; description: string };
    toUser: { username: string };
  }>;
  recentRuns: Array<{
    id: string;
    runNumber: string;
    periodMonth: number;
    periodYear: number;
    status: string;
    totalDepreciation: string;
    assetCount: number;
  }>;
}
