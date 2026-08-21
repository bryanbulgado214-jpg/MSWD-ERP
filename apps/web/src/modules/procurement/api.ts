import type {
  Caf,
  CreatePurchaseRequestInput,
  DisbursementVoucher,
  InspectionReport,
  Ors,
  PurchaseOrder,
  PurchaseRequest,
  Supplier,
  UpdatePurchaseRequestInput,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

class ProcurementApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProcurementApiError';
  }
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    // not JSON
  }
  return fallback;
}

async function authFetch(path: string): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401)
    throw new ProcurementApiError('Not signed in, or your session has expired.', 401);
  if (response.status === 403)
    throw new ProcurementApiError('You do not have permission to view this.', 403);
  if (response.status === 404) throw new ProcurementApiError('Not found.', 404);
  if (!response.ok)
    throw new ProcurementApiError(`Request failed (${response.status}).`, response.status);
  return response;
}

async function authFetchMutate(
  path: string,
  method: 'POST' | 'PATCH',
  body?: unknown,
): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) throw new ProcurementApiError('Not signed in.', 401);
  if (response.status === 403)
    throw new ProcurementApiError(await extractErrorMessage(response, 'Forbidden.'), 403);
  if (response.status === 404) throw new ProcurementApiError('Not found.', 404);
  if (response.status === 409)
    throw new ProcurementApiError(
      await extractErrorMessage(response, 'Modified concurrently — reload.'),
      409,
    );
  if (response.status === 400)
    throw new ProcurementApiError(await extractErrorMessage(response, 'Invalid request.'), 400);
  if (!response.ok)
    throw new ProcurementApiError(
      await extractErrorMessage(response, `Failed (${response.status}).`),
      response.status,
    );
  return response;
}

export async function listPurchaseRequests(status?: string): Promise<PurchaseRequest[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await authFetch(`/procurement/purchase-requests${qs}`);
  return res.json();
}

export async function listPendingEndorsement(): Promise<PurchaseRequest[]> {
  const res = await authFetch('/procurement/purchase-requests/pending-endorsement');
  return res.json();
}

export async function listPendingBudgetCertification(): Promise<PurchaseRequest[]> {
  const res = await authFetch('/procurement/purchase-requests/pending-budget-certification');
  return res.json();
}

export async function listPendingApproval(): Promise<PurchaseRequest[]> {
  const res = await authFetch('/procurement/purchase-requests/pending-approval');
  return res.json();
}

export async function listPendingProcurement(): Promise<PurchaseRequest[]> {
  const res = await authFetch('/procurement/purchase-requests/pending-procurement');
  return res.json();
}

export async function getPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const res = await authFetch(`/procurement/purchase-requests/${id}`);
  return res.json();
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate('/procurement/purchase-requests', 'POST', input);
  return res.json();
}

export async function updatePurchaseRequest(
  id: string,
  input: UpdatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}`, 'PATCH', input);
  return res.json();
}

export async function submitPurchaseRequest(
  id: string,
  expectedVersion: number,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/submit`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function endorsePurchaseRequest(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/endorse`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function budgetCertifyPurchaseRequest(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/budget-certify`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function finalApprovePurchaseRequest(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/approve`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function acceptForProcurement(
  id: string,
  expectedVersion: number,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(
    `/procurement/purchase-requests/${id}/accept-procurement`,
    'POST',
    { expectedVersion },
  );
  return res.json();
}

export async function returnPurchaseRequest(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/return`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function rejectPurchaseRequest(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/reject`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function cancelPurchaseRequest(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/cancel`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export interface BudgetReleaseOption {
  id: string;
  releaseNumber: string;
  releasedAmount: string;
  availableAmount: string;
  status: string;
  budgetHeader: {
    id: string;
    responsibilityCenter: { code: string; name: string };
    fundSource: { code: string; name: string };
  };
}

export async function listAvailableBudgetReleases(): Promise<BudgetReleaseOption[]> {
  const res = await authFetch('/procurement/lookups/budget-releases?status=released');
  return res.json();
}

// ── Procurement-scoped lookups (no budgeting.read needed) ──

export interface ProcurementFiscalYear {
  id: string;
  year: number;
  name: string;
  startDate: string;
  endDate: string;
}

export async function listProcurementFiscalYears(): Promise<ProcurementFiscalYear[]> {
  const res = await authFetch('/procurement/lookups/fiscal-years');
  return res.json();
}

// ── PPMP Items ──

export interface PpmpItem {
  id: string;
  organizationId: string;
  fiscalYearId: string;
  departmentId: string;
  assignedUserId: string | null;
  code: string;
  itemDescription: string;
  procurementCategory: string;
  unitOfMeasure: string;
  quantity: string;
  estimatedUnitCost: string;
  estimatedTotalCost: string;
  modeOfProcurement: string | null;
  scheduleQuarter: number | null;
  cboNotes: string | null;
  status: string;
  createdAt: string;
  department?: { id: string; code: string; name: string };
  fiscalYear?: { id: string; year: number; name: string };
  assignedUser?: { id: string; username: string; email: string } | null;
}

export interface PpmpItemWithRemaining extends PpmpItem {
  requestedAmount: string;
  remainingAmount: string;
  usedQuantity: string;
  remainingQuantity: string;
}

export interface CreatePpmpItemInput {
  fiscalYearId: string;
  departmentId: string;
  assignedUserId?: string;
  code: string;
  itemDescription: string;
  procurementCategory: string;
  unitOfMeasure: string;
  quantity: number;
  estimatedUnitCost: number;
  modeOfProcurement?: string;
  scheduleQuarter?: number;
  cboNotes?: string;
}

export async function createPpmpItem(input: CreatePpmpItemInput): Promise<PpmpItem> {
  const res = await authFetchMutate('/procurement/ppmp-items', 'POST', input);
  return res.json();
}

export async function updatePpmpItem(
  id: string,
  input: Partial<CreatePpmpItemInput>,
): Promise<PpmpItem> {
  const res = await authFetchMutate(`/procurement/ppmp-items/${id}`, 'PATCH', input);
  return res.json();
}

export async function listPpmpItems(filters?: {
  fiscalYearId?: string;
  departmentId?: string;
  assignedUserId?: string;
  status?: string;
}): Promise<PpmpItem[]> {
  const params = new URLSearchParams();
  if (filters?.fiscalYearId) params.set('fiscalYearId', filters.fiscalYearId);
  if (filters?.departmentId) params.set('departmentId', filters.departmentId);
  if (filters?.assignedUserId) params.set('assignedUserId', filters.assignedUserId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const res = await authFetch(`/procurement/ppmp-items${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function listMyPpmpItems(fiscalYearId?: string): Promise<PpmpItemWithRemaining[]> {
  const qs = fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : '';
  const res = await authFetch(`/procurement/ppmp-items/my${qs}`);
  return res.json();
}

export async function approvePpmpItem(id: string): Promise<PpmpItem> {
  const res = await authFetchMutate(`/procurement/ppmp-items/${id}/approve`, 'POST');
  return res.json();
}

export async function bulkApprovePpmpItems(ids: string[]): Promise<{ count: number }> {
  const res = await authFetchMutate('/procurement/ppmp-items/bulk-approve', 'POST', { ids });
  return res.json();
}

// ── Suppliers ──

export async function listSuppliers(includeInactive = false): Promise<Supplier[]> {
  const qs = includeInactive ? '?includeInactive=true' : '';
  const res = await authFetch(`/procurement/suppliers${qs}`);
  return res.json();
}

export async function getSupplier(id: string): Promise<Supplier> {
  const res = await authFetch(`/procurement/suppliers/${id}`);
  return res.json();
}

export async function createSupplier(data: {
  name: string;
  tin?: string;
  address?: string;
  contactPerson?: string;
  contactNumber?: string;
  email?: string;
}): Promise<Supplier> {
  const res = await authFetchMutate('/procurement/suppliers', 'POST', data);
  return res.json();
}

export async function updateSupplier(
  id: string,
  data: {
    expectedVersion: number;
    name?: string;
    tin?: string;
    address?: string;
    contactPerson?: string;
    contactNumber?: string;
    email?: string;
    isActive?: boolean;
  },
): Promise<Supplier> {
  const res = await authFetchMutate(`/procurement/suppliers/${id}`, 'PATCH', data);
  return res.json();
}

// ── Purchase Orders ──

export async function listPurchaseOrders(filters?: {
  status?: string;
  purchaseRequestId?: string;
}): Promise<PurchaseOrder[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.purchaseRequestId) params.set('purchaseRequestId', filters.purchaseRequestId);
  const qs = params.toString();
  const res = await authFetch(`/procurement/purchase-orders${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const res = await authFetch(`/procurement/purchase-orders/${id}`);
  return res.json();
}

export async function createPurchaseOrder(data: {
  purchaseRequestId: string;
  supplierId: string;
  poDate: string;
  contractAmount: number;
  awardDate?: string;
  awardNoticeNumber?: string;
  modeOfProcurement?: string;
  deliveryTerms?: string;
  paymentTerms?: string;
  remarks?: string;
}): Promise<PurchaseOrder> {
  const res = await authFetchMutate('/procurement/purchase-orders', 'POST', data);
  return res.json();
}

export async function submitPoForCaf(id: string, expectedVersion: number): Promise<PurchaseOrder> {
  const res = await authFetchMutate(`/procurement/purchase-orders/${id}/submit-for-caf`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function approvePurchaseOrder(
  id: string,
  expectedVersion: number,
): Promise<PurchaseOrder> {
  const res = await authFetchMutate(`/procurement/purchase-orders/${id}/approve`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function cancelPurchaseOrder(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseOrder> {
  const res = await authFetchMutate(`/procurement/purchase-orders/${id}/cancel`, 'POST', {
    expectedVersion,
    remarks,
  });
  return res.json();
}

// ── CAFs ──

export async function listCafs(filters?: {
  status?: string;
  purchaseRequestId?: string;
  purchaseOrderId?: string;
}): Promise<Caf[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.purchaseRequestId) params.set('purchaseRequestId', filters.purchaseRequestId);
  if (filters?.purchaseOrderId) params.set('purchaseOrderId', filters.purchaseOrderId);
  const qs = params.toString();
  const res = await authFetch(`/procurement/cafs${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function getCaf(id: string): Promise<Caf> {
  const res = await authFetch(`/procurement/cafs/${id}`);
  return res.json();
}

export async function createCaf(data: {
  purchaseRequestId: string;
  purchaseOrderId?: string;
  budgetReleaseId: string;
  budgetReservationId?: string;
  budgetLineId?: string;
  certifiedAmount: number;
  accountCode?: string;
  remarks?: string;
}): Promise<Caf> {
  const res = await authFetchMutate('/procurement/cafs', 'POST', data);
  return res.json();
}

export async function submitCafForCertification(id: string, expectedVersion: number): Promise<Caf> {
  const res = await authFetchMutate(`/procurement/cafs/${id}/submit`, 'POST', { expectedVersion });
  return res.json();
}

export async function certifyCaf(id: string, expectedVersion: number): Promise<Caf> {
  const res = await authFetchMutate(`/procurement/cafs/${id}/certify`, 'POST', { expectedVersion });
  return res.json();
}

export async function rejectCaf(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<Caf> {
  const res = await authFetchMutate(`/procurement/cafs/${id}/reject`, 'POST', {
    expectedVersion,
    remarks,
  });
  return res.json();
}

export async function cancelCaf(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<Caf> {
  const res = await authFetchMutate(`/procurement/cafs/${id}/cancel`, 'POST', {
    expectedVersion,
    remarks,
  });
  return res.json();
}

// ── ORS ──

export async function listOrs(filters?: {
  status?: string;
  cafId?: string;
  purchaseRequestId?: string;
}): Promise<Ors[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.cafId) params.set('cafId', filters.cafId);
  if (filters?.purchaseRequestId) params.set('purchaseRequestId', filters.purchaseRequestId);
  const qs = params.toString();
  const res = await authFetch(`/procurement/ors${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function getOrs(id: string): Promise<Ors> {
  const res = await authFetch(`/procurement/ors/${id}`);
  return res.json();
}

export async function createOrs(data: {
  cafId: string;
  orsDate: string;
  originalAmount: number;
  budgetLineId?: string;
  accountCode?: string;
  requestingOfficeId?: string;
  remarks?: string;
}): Promise<Ors> {
  const res = await authFetchMutate('/procurement/ors', 'POST', data);
  return res.json();
}

export async function submitOrs(id: string, expectedVersion: number): Promise<Ors> {
  const res = await authFetchMutate(`/procurement/ors/${id}/submit`, 'POST', { expectedVersion });
  return res.json();
}

export async function certifyOrsRequesting(id: string, expectedVersion: number): Promise<Ors> {
  const res = await authFetchMutate(`/procurement/ors/${id}/certify-requesting`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function certifyOrsBudget(id: string, expectedVersion: number): Promise<Ors> {
  const res = await authFetchMutate(`/procurement/ors/${id}/certify-budget`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function cancelOrs(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<Ors> {
  const res = await authFetchMutate(`/procurement/ors/${id}/cancel`, 'POST', {
    expectedVersion,
    remarks,
  });
  return res.json();
}

export async function addOrsChild(
  orsId: string,
  data: {
    childType: string;
    childDate: string;
    amount: number;
    referenceNumber?: string;
    description?: string;
    remarks?: string;
  },
): Promise<unknown> {
  const res = await authFetchMutate(`/procurement/ors/${orsId}/children`, 'POST', data);
  return res.json();
}

export async function addOrsAdjustment(
  orsId: string,
  data: {
    adjustmentType: string;
    signedAmount: number;
    reason: string;
    cafId?: string;
  },
): Promise<unknown> {
  const res = await authFetchMutate(`/procurement/ors/${orsId}/adjustments`, 'POST', data);
  return res.json();
}

// ── Lifecycle transitions ──

export async function markPrLifecycle(
  id: string,
  expectedVersion: number,
  targetStatus: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/lifecycle`, 'POST', {
    expectedVersion,
    targetStatus,
  });
  return res.json();
}

export async function inspectPr(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<PurchaseRequest> {
  const res = await authFetchMutate(`/procurement/purchase-requests/${id}/inspect`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

// ── Audit Trail ──

export interface AuditLogEntry {
  id: string;
  tableName: string;
  recordId: string;
  action: 'insert' | 'update' | 'delete';
  changedFields: Record<string, unknown> | null;
  performedBy: { id: string; username: string } | null;
  performedAt: string;
}

export async function listAuditTrail(filters?: {
  tableName?: string;
  recordId?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (filters?.tableName) params.set('tableName', filters.tableName);
  if (filters?.recordId) params.set('recordId', filters.recordId);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const res = await authFetch(`/procurement/audit-trail${qs ? `?${qs}` : ''}`);
  return res.json();
}

// ── APP Items ──

export interface AppItem {
  id: string;
  appNumber: string;
  procurementProjectTitle: string;
  procurementCategory: string;
  approvedBudget: string;
  procurementMode: string | null;
  scheduleMonth: number | null;
  status: string;
  ppmpItem: { id: string; code: string; itemDescription: string };
  fiscalYear: { id: string; year: number; name: string };
}

export async function listAppItems(filters?: {
  fiscalYearId?: string;
  status?: string;
}): Promise<AppItem[]> {
  const params = new URLSearchParams();
  if (filters?.fiscalYearId) params.set('fiscalYearId', filters.fiscalYearId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const res = await authFetch(`/procurement/app-items${qs ? `?${qs}` : ''}`);
  return res.json();
}

// ── Delegation Authorities ──

export interface Delegation {
  id: string;
  delegatorUserId: string;
  delegateUserId: string;
  permissionCode: string;
  effectiveDate: string;
  expirationDate: string;
  amountLimit: string | null;
  scopeDepartmentId: string | null;
  status: 'active' | 'revoked' | 'expired';
  remarks: string | null;
  createdAt: string;
  version: number;
  delegator: { id: string; username: string };
  delegate: { id: string; username: string };
  scopeDepartment: { id: string; name: string } | null;
  creator: { id: string; username: string } | null;
}

export async function listDelegations(filters?: {
  delegatorUserId?: string;
  delegateUserId?: string;
  status?: string;
}): Promise<Delegation[]> {
  const params = new URLSearchParams();
  if (filters?.delegatorUserId) params.set('delegatorUserId', filters.delegatorUserId);
  if (filters?.delegateUserId) params.set('delegateUserId', filters.delegateUserId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const res = await authFetch(`/procurement/delegations${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function createDelegation(data: {
  delegateUserId: string;
  permissionCode: string;
  effectiveDate: string;
  expirationDate: string;
  amountLimit?: number;
  scopeDepartmentId?: string;
  remarks?: string;
}): Promise<Delegation> {
  const res = await authFetchMutate('/procurement/delegations', 'POST', data);
  return res.json();
}

export async function revokeDelegation(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<Delegation> {
  const res = await authFetchMutate(`/procurement/delegations/${id}/revoke`, 'PATCH', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

// ── Lookups ──

export interface LookupUser {
  id: string;
  username: string;
  email: string;
}

export interface LookupPermission {
  id: string;
  code: string;
  name: string;
}

export interface LookupDepartment {
  id: string;
  name: string;
  code: string;
}

export async function listLookupUsers(): Promise<LookupUser[]> {
  const res = await authFetch('/procurement/lookups/users');
  return res.json();
}

export async function listLookupPermissions(): Promise<LookupPermission[]> {
  const res = await authFetch('/procurement/lookups/permissions');
  return res.json();
}

export async function listLookupDepartments(): Promise<LookupDepartment[]> {
  const res = await authFetch('/procurement/lookups/departments');
  return res.json();
}

// ── Inspection Reports ──

export async function listInspections(filters?: {
  purchaseOrderId?: string;
  status?: string;
}): Promise<InspectionReport[]> {
  const params = new URLSearchParams();
  if (filters?.purchaseOrderId) params.set('purchaseOrderId', filters.purchaseOrderId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const res = await authFetch(`/procurement/inspections${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function getInspection(id: string): Promise<InspectionReport> {
  const res = await authFetch(`/procurement/inspections/${id}`);
  return res.json();
}

export async function createInspection(data: {
  purchaseOrderId: string;
  deliveryDate: string;
  deliveryNote?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  findings?: string;
  recommendations?: string;
  items: Array<{
    prItemId?: string;
    description: string;
    unitOfMeasure?: string;
    quantityOrdered: number;
    quantityDelivered: number;
    quantityAccepted: number;
    quantityRejected: number;
    result: string;
    remarks?: string;
  }>;
}): Promise<InspectionReport> {
  const res = await authFetchMutate('/procurement/inspections', 'POST', data);
  return res.json();
}

export async function submitInspection(
  id: string,
  expectedVersion: number,
): Promise<InspectionReport> {
  const res = await authFetchMutate(`/procurement/inspections/${id}/submit`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function acceptInspection(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<InspectionReport> {
  const res = await authFetchMutate(`/procurement/inspections/${id}/accept`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function rejectInspection(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<InspectionReport> {
  const res = await authFetchMutate(`/procurement/inspections/${id}/reject`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

// ── Disbursement Vouchers ────────────────────────────────────────

export async function listDvs(): Promise<DisbursementVoucher[]> {
  const res = await authFetch('/procurement/dvs');
  return res.json();
}

export async function getDv(id: string): Promise<DisbursementVoucher> {
  const res = await authFetch(`/procurement/dvs/${id}`);
  return res.json();
}

export async function createDv(data: {
  orsId: string;
  particulars: string;
  grossAmount: number;
  paymentMode?: string;
  taxAmount?: number;
  otherDeductions?: number;
  deductions?: { label: string; chartOfAccountId: string; amount: number }[];
  inspectionReportId?: string;
  accountCode?: string;
  checkNumber?: string;
  checkDate?: string;
  bankName?: string;
}): Promise<DisbursementVoucher> {
  const res = await authFetchMutate('/procurement/dvs', 'POST', data);
  return res.json();
}

export async function submitDvForCertification(
  id: string,
  expectedVersion: number,
): Promise<DisbursementVoucher> {
  const res = await authFetchMutate(`/procurement/dvs/${id}/submit-for-certification`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function certifyDv(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<DisbursementVoucher> {
  const res = await authFetchMutate(`/procurement/dvs/${id}/certify`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function submitDvForApproval(
  id: string,
  expectedVersion: number,
): Promise<DisbursementVoucher> {
  const res = await authFetchMutate(`/procurement/dvs/${id}/submit-for-approval`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function approveDv(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<DisbursementVoucher> {
  const res = await authFetchMutate(`/procurement/dvs/${id}/approve`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export async function releaseDv(
  id: string,
  expectedVersion: number,
  payment?: {
    checkNumber?: string;
    checkDate?: string;
    bankName?: string;
    remarks?: string;
  },
): Promise<DisbursementVoucher> {
  const res = await authFetchMutate(`/procurement/dvs/${id}/release`, 'POST', {
    expectedVersion,
    ...(payment ?? {}),
  });
  return res.json();
}

export async function cancelDv(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<DisbursementVoucher> {
  const res = await authFetchMutate(`/procurement/dvs/${id}/cancel`, 'POST', {
    expectedVersion,
    ...(remarks ? { remarks } : {}),
  });
  return res.json();
}

export { ProcurementApiError };
