import type {
  AssetCategory,
  AssetDashboard,
  AssetRegisterItem,
  AssetTransfer,
  DepreciationRun,
  DepreciationScheduleItem,
} from './types';

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
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

/* ---------- Categories ---------- */

export async function getCategories(): Promise<AssetCategory[]> {
  const res = await authFetch('/asset/categories');
  return res.json();
}

export async function getCategory(id: string): Promise<AssetCategory> {
  const res = await authFetch(`/asset/categories/${id}`);
  return res.json();
}

export async function createCategory(data: {
  code: string;
  name: string;
  description?: string;
  depreciationMethod?: string;
  defaultUsefulLife?: number;
  ppeAccountCode?: string;
  accumDeprAccountCode?: string;
  deprExpenseAccountCode?: string;
}): Promise<AssetCategory> {
  const res = await authFetchMutate('/asset/categories', 'POST', data);
  return res.json();
}

export async function updateCategory(
  id: string,
  data: {
    code?: string;
    name?: string;
    description?: string;
    depreciationMethod?: string;
    defaultUsefulLife?: number;
    ppeAccountCode?: string;
    accumDeprAccountCode?: string;
    deprExpenseAccountCode?: string;
    isActive?: boolean;
  },
): Promise<AssetCategory> {
  const res = await authFetchMutate(`/asset/categories/${id}`, 'PUT', data);
  return res.json();
}

export async function assignCategory(
  propertyRecordId: string,
  assetCategoryId: string,
): Promise<unknown> {
  const res = await authFetchMutate(
    `/asset/property-records/${propertyRecordId}/assign-category`,
    'POST',
    { assetCategoryId },
  );
  return res.json();
}

/* ---------- Depreciation Runs ---------- */

export async function getDepreciationRuns(status?: string): Promise<DepreciationRun[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authFetch(`/asset/depreciation-runs${qs}`);
  return res.json();
}

export async function getDepreciationRun(id: string): Promise<DepreciationRun> {
  const res = await authFetch(`/asset/depreciation-runs/${id}`);
  return res.json();
}

export async function createDepreciationRun(data: {
  periodMonth: number;
  periodYear: number;
}): Promise<DepreciationRun> {
  const res = await authFetchMutate('/asset/depreciation-runs', 'POST', data);
  return res.json();
}

export async function postDepreciationRun(id: string, version: number): Promise<DepreciationRun> {
  const res = await authFetchMutate(`/asset/depreciation-runs/${id}/post`, 'POST', {
    expectedVersion: version,
  });
  return res.json();
}

export async function voidDepreciationRun(id: string, version: number): Promise<DepreciationRun> {
  const res = await authFetchMutate(`/asset/depreciation-runs/${id}/void`, 'POST', {
    expectedVersion: version,
  });
  return res.json();
}

/* ---------- Transfers ---------- */

export async function getTransfers(status?: string): Promise<AssetTransfer[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authFetch(`/asset/transfers${qs}`);
  return res.json();
}

export async function getTransfer(id: string): Promise<AssetTransfer> {
  const res = await authFetch(`/asset/transfers/${id}`);
  return res.json();
}

export async function createTransfer(data: {
  propertyRecordId: string;
  toUserId: string;
  toLocationId?: string;
  transferDate: string;
  reason?: string;
}): Promise<AssetTransfer> {
  const res = await authFetchMutate('/asset/transfers', 'POST', data);
  return res.json();
}

export async function approveTransfer(id: string, version: number): Promise<AssetTransfer> {
  const res = await authFetchMutate(`/asset/transfers/${id}/approve`, 'POST', {
    expectedVersion: version,
  });
  return res.json();
}

export async function rejectTransfer(
  id: string,
  version: number,
  reason?: string,
): Promise<AssetTransfer> {
  const res = await authFetchMutate(`/asset/transfers/${id}/reject`, 'POST', {
    expectedVersion: version,
    ...(reason ? { reason } : {}),
  });
  return res.json();
}

export async function completeTransfer(id: string, version: number): Promise<AssetTransfer> {
  const res = await authFetchMutate(`/asset/transfers/${id}/complete`, 'POST', {
    expectedVersion: version,
  });
  return res.json();
}

/* ---------- Register & Dashboard & Reports ---------- */

export async function getAssetRegister(params?: string): Promise<AssetRegisterItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/asset/register${qs}`);
  return res.json();
}

export async function getDashboard(): Promise<AssetDashboard> {
  const res = await authFetch('/asset/dashboard');
  return res.json();
}

export async function getDepreciationSchedule(
  categoryId?: string,
): Promise<DepreciationScheduleItem[]> {
  const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  const res = await authFetch(`/asset/reports/depreciation-schedule${qs}`);
  return res.json();
}

/* ---------- Lookups ---------- */

export async function getPropertyRecords(): Promise<
  Array<{
    id: string;
    propertyNumber: string;
    description: string;
    accountableUserId: string | null;
    locationId: string | null;
    isDisposed: boolean;
  }>
> {
  const res = await authFetch('/inventory/property');
  return res.json();
}

export async function getUsers(): Promise<Array<{ id: string; username: string }>> {
  const res = await authFetch('/admin/users');
  return res.json();
}

export async function getLocations(): Promise<Array<{ id: string; name: string }>> {
  const res = await authFetch('/inventory/locations');
  return res.json();
}
