export interface WorkOrder {
  id: string;
  organizationId: string;
  woNumber: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  title: string;
  description: string | null;
  consumerId: string | null;
  meterId: string | null;
  location: string | null;
  scheduledDate: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  completionNotes: string | null;
  estimatedDurationHrs: string | null;
  actualDurationHrs: string | null;
  materialsCost: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  consumer?: { id: string; firstName: string; lastName: string; accountNumber: string; address?: string } | null;
  meter?: { id: string; serialNumber: string; brand?: string } | null;
  assignee?: { id: string; firstName: string; lastName: string; position?: { title: string } | null } | null;
  verifier?: { id: string; username: string } | null;
  creator?: { id: string; username: string } | null;
  updater?: { id: string; username: string } | null;
  materials?: WorkOrderMaterial[];
  notes?: WorkOrderNote[];
  _count?: { materials: number; notes: number };
}

export interface WorkOrderMaterial {
  id: string;
  workOrderId: string;
  inventoryItemId: string;
  quantityUsed: string;
  unitCost: string;
  totalCost: string;
  notes: string | null;
  createdAt: string;
  inventoryItem?: { id: string; itemCode: string; description: string; unitOfMeasure: string };
}

export interface WorkOrderNote {
  id: string;
  workOrderId: string;
  note: string;
  createdBy: string | null;
  createdAt: string;
  author?: { id: string; username: string } | null;
}

export type WorkOrderType = 'installation' | 'repair' | 'replacement' | 'disconnection' | 'reconnection' | 'inspection' | 'maintenance';
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkOrderStatus = 'draft' | 'pending' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'cancelled';

export interface WorkOrderDashboard {
  byStatus: Array<{ status: string; _count: number }>;
  byType: Array<{ type: string; _count: number }>;
  byPriority: Array<{ priority: string; _count: number }>;
  recentCompleted: Array<{
    id: string;
    woNumber: string;
    title: string;
    type: string;
    status: string;
    completedAt: string | null;
    materialsCost: string;
  }>;
}

export const WO_TYPE_LABELS: Record<WorkOrderType, string> = {
  installation: 'Installation',
  repair: 'Repair',
  replacement: 'Replacement',
  disconnection: 'Disconnection',
  reconnection: 'Reconnection',
  inspection: 'Inspection',
  maintenance: 'Maintenance',
};

export const WO_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
};
