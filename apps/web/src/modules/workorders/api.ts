import type { WorkOrder, WorkOrderDashboard, WorkOrderMaterial, WorkOrderNote } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    /* not JSON */
  }
  return fallback;
}

async function authFetch(path: string): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) throw new Error('Not signed in, or session expired.');
  if (response.status === 403) throw new Error('No permission.');
  if (response.status === 404) throw new Error('Not found.');
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return response;
}

async function authFetchMutate(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
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
  if (response.status === 401) throw new Error('Not signed in.');
  if (response.status === 403) throw new Error(await extractErrorMessage(response, 'Forbidden.'));
  if (response.status === 404) throw new Error('Not found.');
  if (response.status === 409)
    throw new Error(await extractErrorMessage(response, 'Modified concurrently — reload.'));
  if (response.status === 400)
    throw new Error(await extractErrorMessage(response, 'Invalid request.'));
  if (!response.ok)
    throw new Error(await extractErrorMessage(response, `Failed (${response.status}).`));
  return response;
}

export async function getWorkOrders(params?: string): Promise<WorkOrder[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/workorders${qs}`);
  return res.json();
}

export async function getWorkOrder(id: string): Promise<WorkOrder> {
  const res = await authFetch(`/workorders/${id}`);
  return res.json();
}

export async function getDashboard(): Promise<WorkOrderDashboard> {
  const res = await authFetch('/workorders/dashboard');
  return res.json();
}

export async function createWorkOrder(data: {
  type: string;
  priority?: string;
  title: string;
  description?: string;
  consumerId?: string;
  meterId?: string;
  location?: string;
  scheduledDate?: string;
  assignedTo?: string;
  estimatedDurationHrs?: number;
}): Promise<WorkOrder> {
  const res = await authFetchMutate('/workorders', 'POST', data);
  return res.json();
}

export async function updateWorkOrder(
  id: string,
  data: {
    expectedVersion: number;
    priority?: string;
    title?: string;
    description?: string;
    consumerId?: string;
    meterId?: string;
    location?: string;
    scheduledDate?: string;
    estimatedDurationHrs?: number;
  },
): Promise<WorkOrder> {
  const res = await authFetchMutate(`/workorders/${id}`, 'PATCH', data);
  return res.json();
}

export async function assignWorkOrder(
  id: string,
  data: { expectedVersion: number; assignedTo: string },
): Promise<WorkOrder> {
  const res = await authFetchMutate(`/workorders/${id}/assign`, 'POST', data);
  return res.json();
}

export async function startWorkOrder(
  id: string,
  data: { expectedVersion: number },
): Promise<WorkOrder> {
  const res = await authFetchMutate(`/workorders/${id}/start`, 'POST', data);
  return res.json();
}

export async function completeWorkOrder(
  id: string,
  data: {
    expectedVersion: number;
    completionNotes?: string;
    actualDurationHrs?: number;
  },
): Promise<WorkOrder> {
  const res = await authFetchMutate(`/workorders/${id}/complete`, 'POST', data);
  return res.json();
}

export async function verifyWorkOrder(
  id: string,
  data: { expectedVersion: number },
): Promise<WorkOrder> {
  const res = await authFetchMutate(`/workorders/${id}/verify`, 'POST', data);
  return res.json();
}

export async function cancelWorkOrder(
  id: string,
  data: { expectedVersion: number; reason?: string },
): Promise<WorkOrder> {
  const res = await authFetchMutate(`/workorders/${id}/cancel`, 'POST', data);
  return res.json();
}

export async function addWorkOrderNote(id: string, note: string): Promise<WorkOrderNote> {
  const res = await authFetchMutate(`/workorders/${id}/notes`, 'POST', { note });
  return res.json();
}

export async function addWorkOrderMaterial(
  id: string,
  data: {
    inventoryItemId: string;
    quantityUsed: number;
    unitCost?: number;
    notes?: string;
  },
): Promise<WorkOrderMaterial> {
  const res = await authFetchMutate(`/workorders/${id}/materials`, 'POST', data);
  return res.json();
}

export async function removeWorkOrderMaterial(id: string, materialId: string): Promise<void> {
  await authFetchMutate(`/workorders/${id}/materials/${materialId}`, 'DELETE');
}

export async function getReport(params?: string): Promise<{
  orders: Array<{
    id: string;
    woNumber: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    location: string | null;
    scheduledDate: string | null;
    completedAt: string | null;
    verifiedAt: string | null;
    estimatedDurationHrs: string | null;
    actualDurationHrs: string | null;
    materialsCost: string;
    createdAt: string;
    consumer: { firstName: string; lastName: string; accountNumber: string } | null;
    assignee: { firstName: string; lastName: string } | null;
  }>;
  summary: { totalCount: number; totalMaterialsCost: string };
}> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/workorders/reports${qs}`);
  return res.json();
}

export async function getConsumersLookup(): Promise<
  Array<{ id: string; accountNumber: string; firstName: string; lastName: string }>
> {
  const res = await authFetch('/billing/consumers?status=active');
  return res.json();
}

export async function getEmployeesLookup(): Promise<
  Array<{ id: string; firstName: string; lastName: string; position?: { title: string } | null }>
> {
  const res = await authFetch('/hr/employees?isActive=true');
  return res.json();
}

export async function getInventoryItemsLookup(search?: string): Promise<
  Array<{
    id: string;
    itemCode: string;
    description: string;
    unitOfMeasure: string;
    unitCost: string;
    onHandQuantity: string;
  }>
> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await authFetch(`/inventory/items${qs}`);
  return res.json();
}
