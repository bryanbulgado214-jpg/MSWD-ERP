const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

async function authFetch(path: string): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(err.message ?? response.statusText);
  }
  return response;
}

async function authFetchMutate(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(err.message ?? response.statusText);
  }
  return response;
}

export interface UserSummary {
  id: string;
  username: string;
  fullName: string | null;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { assignmentId: string; id: string; code: string; name: string }[];
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  _count: { userRoles: number; rolePermissions: number };
}

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  permissions: { assignmentId: string; id: string; code: string; name: string; module: string }[];
  users: { assignmentId: string; id: string; username: string; email: string }[];
}

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  module: string;
}

export async function listUsers(): Promise<UserSummary[]> {
  const res = await authFetch('/admin/users');
  return res.json();
}

export async function getUser(id: string): Promise<UserSummary> {
  const res = await authFetch(`/admin/users/${id}`);
  return res.json();
}

export async function createUser(data: {
  username: string;
  fullName?: string;
  email: string;
  password: string;
}): Promise<unknown> {
  const res = await authFetchMutate('/admin/users', 'POST', data);
  return res.json();
}

export async function updateUser(
  id: string,
  data: { fullName?: string; email?: string; password?: string; isActive?: boolean },
): Promise<unknown> {
  const res = await authFetchMutate(`/admin/users/${id}`, 'PATCH', data);
  return res.json();
}

/** The permission codes granted directly to this user (independent of roles). */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const res = await authFetch(`/admin/users/${userId}/permissions`);
  return res.json();
}

/** Replace this user's direct permission grants with exactly `codes`. */
export async function setUserPermissions(
  userId: string,
  codes: string[],
): Promise<{ codes: string[] }> {
  const res = await authFetchMutate(`/admin/users/${userId}/permissions`, 'PUT', { codes });
  return res.json();
}

export async function assignRole(userId: string, roleId: string): Promise<unknown> {
  const res = await authFetchMutate(`/admin/users/${userId}/roles`, 'POST', { roleId });
  return res.json();
}

export async function revokeRole(userId: string, assignmentId: string): Promise<void> {
  await authFetchMutate(`/admin/users/${userId}/roles/${assignmentId}`, 'DELETE');
}

export async function listRoles(): Promise<RoleSummary[]> {
  const res = await authFetch('/admin/roles');
  return res.json();
}

export async function getRole(id: string): Promise<RoleDetail> {
  const res = await authFetch(`/admin/roles/${id}`);
  return res.json();
}

export async function listPermissions(): Promise<PermissionItem[]> {
  const res = await authFetch('/admin/roles/permissions');
  return res.json();
}

export async function addPermissionToRole(roleId: string, permissionId: string): Promise<unknown> {
  const res = await authFetchMutate(`/admin/roles/${roleId}/permissions`, 'POST', { permissionId });
  return res.json();
}

export async function removePermissionFromRole(
  roleId: string,
  assignmentId: string,
): Promise<void> {
  await authFetchMutate(`/admin/roles/${roleId}/permissions/${assignmentId}`, 'DELETE');
}

// ── Demo Data (demonstration only) ──

export async function getDemoStatus(): Promise<{ present: boolean; jevCount: number }> {
  const res = await authFetch('/admin/demo-data/status');
  return res.json();
}

export async function generateDemoData(): Promise<{ created: number }> {
  const res = await authFetchMutate('/admin/demo-data/generate', 'POST');
  return res.json();
}

export async function wipeDemoData(): Promise<{ removed: number }> {
  const res = await authFetchMutate('/admin/demo-data/wipe', 'POST');
  return res.json();
}

// ── Audit Trail ──

export interface AuditLogRow {
  id: string;
  tableName: string;
  tableLabel: string;
  module: string;
  recordId: string;
  action: string;
  changedFields: unknown;
  performedBy: { id: string; username: string } | null;
  performedAt: string;
}

export interface AuditLogResult {
  total: number;
  limit: number;
  rows: AuditLogRow[];
}

export async function getAuditLogs(params: string): Promise<AuditLogResult> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/admin/audit-logs${qs}`);
  return res.json();
}

export async function getAuditModules(): Promise<string[]> {
  const res = await authFetch('/admin/audit-logs/modules');
  return res.json();
}

export async function getAuditActors(): Promise<{ id: string; username: string }[]> {
  const res = await authFetch('/admin/audit-logs/actors');
  return res.json();
}

// ── District (Organization) Profile ──

export interface OrganizationProfile {
  id: string;
  name: string;
  legalName: string;
  address: string | null;
  contact: string | null;
  logoUrl: string | null;
  manualDocumentNumbering: boolean;
}

export async function getOrganizationProfile(): Promise<OrganizationProfile> {
  const res = await authFetch('/admin/organization-profile');
  return res.json();
}

export async function updateOrganizationProfile(data: {
  name?: string;
  legalName?: string;
  address?: string;
  contact?: string;
  logoUrl?: string;
  manualDocumentNumbering?: boolean;
}): Promise<OrganizationProfile> {
  const res = await authFetchMutate('/admin/organization-profile', 'PATCH', data);
  return res.json();
}
