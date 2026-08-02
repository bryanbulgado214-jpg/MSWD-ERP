export type ComplaintType = 'water_quality' | 'billing_dispute' | 'service_interruption' | 'leak_report' | 'meter_issue' | 'low_pressure' | 'no_water' | 'illegal_connection' | 'staff_conduct' | 'other';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ComplaintStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
export type ComplaintResolutionType = 'fixed' | 'explained' | 'referred' | 'no_action_needed' | 'duplicate' | 'invalid';

export const COMPLAINT_TYPE_LABELS: Record<ComplaintType, string> = {
  water_quality: 'Water Quality',
  billing_dispute: 'Billing Dispute',
  service_interruption: 'Service Interruption',
  leak_report: 'Leak Report',
  meter_issue: 'Meter Issue',
  low_pressure: 'Low Pressure',
  no_water: 'No Water',
  illegal_connection: 'Illegal Connection',
  staff_conduct: 'Staff Conduct',
  other: 'Other',
};

export const COMPLAINT_PRIORITY_LABELS: Record<ComplaintPriority, string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
};

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open', assigned: 'Assigned', in_progress: 'In Progress',
  resolved: 'Resolved', closed: 'Closed', reopened: 'Reopened',
};

export const RESOLUTION_TYPE_LABELS: Record<ComplaintResolutionType, string> = {
  fixed: 'Fixed', explained: 'Explained', referred: 'Referred',
  no_action_needed: 'No Action Needed', duplicate: 'Duplicate', invalid: 'Invalid',
};

export interface Complaint {
  id: string;
  complaintNumber: string;
  type: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  consumerId: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  resolutionType: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaDueAt: string | null;
  workOrderId: string | null;
  version: number;
  createdAt: string;
  consumer: { id: string; accountNumber: string; firstName: string; lastName: string } | null;
  assignee: { id: string; firstName: string; lastName: string; position?: { title: string } | null } | null;
  workOrder: { id: string; woNumber: string; title: string; status: string } | null;
  notes: Array<{
    id: string;
    note: string;
    isInternal: boolean;
    createdAt: string;
    author: { id: string; username: string } | null;
  }>;
}
