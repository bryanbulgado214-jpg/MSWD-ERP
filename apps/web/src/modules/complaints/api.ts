import type { Complaint } from './types';

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

export async function getComplaints(params?: string): Promise<Complaint[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/complaints${qs}`);
  return res.json();
}

export async function getComplaint(id: string): Promise<Complaint> {
  const res = await authFetch(`/complaints/${id}`);
  return res.json();
}

export async function createComplaint(data: {
  type: string;
  priority?: string;
  subject: string;
  description: string;
  location?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  consumerId?: string;
}): Promise<Complaint> {
  const res = await authFetchMutate('/complaints', 'POST', data);
  return res.json();
}

export async function updateComplaint(
  id: string,
  data: {
    expectedVersion: number;
    priority?: string;
    subject?: string;
    description?: string;
    location?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    consumerId?: string;
  },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}`, 'PATCH', data);
  return res.json();
}

export async function assignComplaint(
  id: string,
  data: { expectedVersion: number; assignedTo: string },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}/assign`, 'POST', data);
  return res.json();
}

export async function startComplaint(
  id: string,
  data: { expectedVersion: number },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}/start`, 'POST', data);
  return res.json();
}

export async function resolveComplaint(
  id: string,
  data: {
    expectedVersion: number;
    resolutionType: string;
    resolutionNotes?: string;
  },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}/resolve`, 'POST', data);
  return res.json();
}

export async function closeComplaint(
  id: string,
  data: { expectedVersion: number },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}/close`, 'POST', data);
  return res.json();
}

export async function reopenComplaint(
  id: string,
  data: { expectedVersion: number; reason?: string },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}/reopen`, 'POST', data);
  return res.json();
}

export async function addComplaintNote(
  id: string,
  note: string,
  isInternal = false,
): Promise<unknown> {
  const res = await authFetchMutate(`/complaints/${id}/notes`, 'POST', { note, isInternal });
  return res.json();
}

export async function linkWorkOrder(
  id: string,
  data: { expectedVersion: number; workOrderId: string },
): Promise<Complaint> {
  const res = await authFetchMutate(`/complaints/${id}/link-work-order`, 'POST', data);
  return res.json();
}

export async function getDashboard(): Promise<{
  byStatus: Array<{ status: string; _count: number }>;
  byType: Array<{ type: string; _count: number }>;
  byPriority: Array<{ priority: string; _count: number }>;
  recentComplaints: Array<Complaint>;
  slaBreached: number;
}> {
  const res = await authFetch('/complaints/dashboard');
  return res.json();
}

export async function getReport(params?: string): Promise<{
  complaints: Complaint[];
  summary: { totalCount: number; resolvedCount: number; avgResolutionHrs: number | null };
}> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/complaints/reports${qs}`);
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
