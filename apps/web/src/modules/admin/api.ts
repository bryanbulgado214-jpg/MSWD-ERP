const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

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

async function authFetchMutate(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<Response> {
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

export async function createUser(data: { username: string; email: string; password: string }): Promise<unknown> {
  const res = await authFetchMutate('/admin/users', 'POST', data);
  return res.json();
}

export async function updateUser(id: string, data: { email?: string; password?: string; isActive?: boolean }): Promise<unknown> {
  const res = await authFetchMutate(`/admin/users/${id}`, 'PATCH', data);
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

export async function removePermissionFromRole(roleId: string, assignmentId: string): Promise<void> {
  await authFetchMutate(`/admin/roles/${roleId}/permissions/${assignmentId}`, 'DELETE');
}
