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
  // ── Crew-dispatch flow ──
  nature: WorkOrderNature;
  customerName: string | null;
  customerSignatureRequired: boolean;
  soloTask: boolean;
  teamId: string | null;
  teamLeaderId: string | null;
  assignedCrewBy: string | null;
  assignedCrewAt: string | null;
  timeLeft: string | null;
  timeReturned: string | null;
  instructions: string | null;
  remarks: string | null;
  tasksPerformed: string | null;
  issuesEncountered: string | null;
  customerConcernId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  consumer?: { id: string; firstName: string; lastName: string; accountNumber: string; address?: string } | null;
  meter?: { id: string; serialNumber: string; brand?: string } | null;
  assignee?: { id: string; firstName: string; lastName: string; position?: { title: string } | null } | null;
  team?: { id: string; name: string } | null;
  teamLeader?: { id: string; name: string; designation?: string | null } | null;
  members?: WorkOrderMember[];
  crews?: WorkOrderCrew[];
  crewAssigner?: { id: string; username: string; fullName?: string | null } | null;
  verifier?: { id: string; username: string; fullName?: string | null } | null;
  creator?: { id: string; username: string; fullName?: string | null } | null;
  updater?: { id: string; username: string; fullName?: string | null } | null;
  materials?: WorkOrderMaterial[];
  notes?: WorkOrderNote[];
  customerConcern?: {
    id: string;
    referenceNumber: string;
    customerName: string;
    category: CcfCategory;
    status: CcfStatus;
  } | null;
  _count?: { materials: number; notes: number; members?: number };
}

// ── Customer Complaint/Concern Form (CCF) ──
export type CcfCategory =
  | 'billing'
  | 'water_quality'
  | 'leakage'
  | 'low_pressure'
  | 'no_water'
  | 'meter_issue'
  | 'other';

export type CcfStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

export const CCF_CATEGORY_LABELS: Record<CcfCategory, string> = {
  billing: 'Billing',
  water_quality: 'Water Quality',
  leakage: 'Leakage',
  low_pressure: 'Low Pressure',
  no_water: 'No Water',
  meter_issue: 'Meter Issue',
  other: 'Other',
};

export const CCF_STATUS_LABELS: Record<CcfStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export interface Ccf {
  id: string;
  organizationId: string;
  referenceNumber: string;
  receivedAt: string;
  customerName: string;
  accountNumber: string | null;
  category: CcfCategory;
  nature: string;
  requestedAction: string | null;
  assignedTo: string | null;
  actionTaken: string | null;
  status: CcfStatus;
  targetResolutionDate: string | null;
  resolvedAt: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  // Aging indicators computed by the API.
  daysOpen: number;
  isOpen: boolean;
  overdue: boolean;
  workOrders?: Array<{ id: string; woNumber: string; status: WorkOrderStatus; title: string }>;
}

export interface CcfLookup {
  id: string;
  referenceNumber: string;
  customerName: string;
  category: CcfCategory;
  status: CcfStatus;
}

export interface CcfCreateInput {
  // Series No. — editable; omitted falls back to the server's suggestion.
  referenceNumber?: string;
  receivedAt: string;
  customerName: string;
  accountNumber?: string;
  category: CcfCategory;
  nature: string;
  requestedAction?: string;
  assignedTo?: string;
  targetResolutionDate?: string;
  remarks?: string;
}

export interface CcfUpdateInput {
  expectedVersion: number;
  referenceNumber?: string;
  receivedAt?: string;
  customerName?: string;
  accountNumber?: string;
  category?: CcfCategory;
  nature?: string;
  requestedAction?: string;
  assignedTo?: string;
  actionTaken?: string;
  status?: CcfStatus;
  targetResolutionDate?: string;
  resolvedAt?: string;
  remarks?: string;
}

export type WorkOrderNature = 'technical' | 'commercial';

export interface WorkOrderPersonnel {
  id: string;
  name: string;
  designation: string | null;
  section: WorkOrderNature | null;
  contactNumber: string | null;
  isActive: boolean;
  version: number;
}

export interface WorkOrderTeam {
  id: string;
  name: string;
  section: WorkOrderNature | null;
  leaderId: string | null;
  isActive: boolean;
  version: number;
  leader?: { id: string; name: string; designation?: string | null } | null;
  members?: Array<{ personnel: { id: string; name: string; designation?: string | null; section?: WorkOrderNature | null } }>;
}

export interface WorkOrderMember {
  id: string;
  workOrderId: string;
  crewId?: string | null;
  personnelId: string;
  isLeader: boolean;
  personnel?: { id: string; name: string; designation?: string | null; section?: WorkOrderNature | null };
}

export type WorkOrderCrewStatus = 'assigned' | 'dispatched' | 'completed' | 'cancelled';

export const WO_CREW_STATUS_LABELS: Record<WorkOrderCrewStatus, string> = {
  assigned: 'Assigned',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// One crew on a work order — its own leader, members, and field lifecycle.
export interface WorkOrderCrew {
  id: string;
  crewNumber: number;
  soloTask: boolean;
  teamId: string | null;
  teamLeaderId: string | null;
  status: WorkOrderCrewStatus;
  timeLeft: string | null;
  timeReturned: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  teamLeader?: { id: string; name: string; designation?: string | null } | null;
  members: WorkOrderMember[];
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

export type WorkOrderType =
  | 'installation'
  | 'repair'
  | 'replacement'
  | 'disconnection'
  | 'reconnection'
  | 'inspection'
  | 'maintenance'
  | 'relocation'
  | 'leak_repair'
  | 'meter_reading'
  | 'meter_verification'
  | 'service_inspection'
  | 'final_reading'
  | 'account_verification'
  | 'serve_notice';
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkOrderStatus = 'draft' | 'pending' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'cancelled';

// Mirrors the backend work-order-taxonomy.ts. Technical types are assigned a crew
// by Technical Services; commercial types by Commercial Services.
const TECHNICAL_TYPES: WorkOrderType[] = [
  'installation', 'relocation', 'reconnection', 'disconnection',
  'repair', 'maintenance', 'replacement', 'leak_repair', 'inspection',
];
export function natureOfType(type: WorkOrderType): WorkOrderNature {
  return TECHNICAL_TYPES.includes(type) ? 'technical' : 'commercial';
}
const SIGNATURE_DEFAULT_TYPES: WorkOrderType[] = [
  'installation', 'relocation', 'reconnection', 'disconnection',
];
export function signatureRequiredByDefault(type: WorkOrderType): boolean {
  return SIGNATURE_DEFAULT_TYPES.includes(type);
}

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
  installation: 'New Installation',
  relocation: 'Relocation',
  reconnection: 'Reconnection',
  disconnection: 'Disconnection',
  repair: 'Repair',
  maintenance: 'Maintenance',
  replacement: 'Replacement',
  leak_repair: 'Leak Repair',
  inspection: 'Inspection',
  meter_reading: 'Meter Reading',
  meter_verification: 'Meter Re-reading / Verification',
  service_inspection: 'Service Application Field Inspection',
  final_reading: 'Final / Closing Reading',
  account_verification: 'Account / Field Verification',
  serve_notice: 'Serving of Notices',
};

export const WO_NATURE_LABELS: Record<WorkOrderNature, string> = {
  technical: 'Technical',
  commercial: 'Commercial',
};

// ── Staff availability master list ──
export type StaffAvailabilityStatus = 'available' | 'on_field' | 'on_leave' | 'unavailable';

export const STAFF_STATUS_LABELS: Record<StaffAvailabilityStatus, string> = {
  available: 'Available',
  on_field: 'On field work',
  on_leave: 'On leave',
  unavailable: 'Unavailable',
};

export interface StaffMember {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  contactNumber: string | null;
  status: StaffAvailabilityStatus;
  statusNote: string | null;
  isFieldPersonnel: boolean;
  workOrderPersonnelId: string | null;
  isActive: boolean;
  version: number;
  workOrderPersonnel?: { id: string; name: string } | null;
}

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
