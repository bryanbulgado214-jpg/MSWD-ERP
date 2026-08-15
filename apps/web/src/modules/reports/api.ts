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

export interface ProcurementSummary {
  totalPRs: number;
  totalAmount: string;
  byStatus: Array<{ status: string; count: number; totalAmount: string }>;
  poCount: number;
  cafCount: number;
  orsCount: number;
}

export interface DepartmentProcurement {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  prCount: number;
  totalAmount: string;
  completedCount: number;
  cancelledCount: number;
}

export interface CategoryBreakdown {
  classification: string | null;
  itemCount: number;
  totalAmount: string;
}

export interface BudgetUtilization {
  rcCode: string;
  rcName: string;
  fsCode: string;
  fsName: string;
  approvedAmount: string;
  releasedAmount: string;
  reservedAmount: string;
  availableAmount: string;
}

export interface MonthlyProcurement {
  month: string;
  prCount: number;
  totalAmount: string;
  poCount: number;
  poAmount: string;
}

export interface SupplierActivity {
  supplierId: string;
  supplierName: string;
  supplierTin: string | null;
  poCount: number;
  totalContract: string;
  approvedPOs: number;
}

export interface FiscalYearOption {
  id: string;
  year: number;
  name: string;
  status: string;
}

export async function getProcurementSummary(): Promise<ProcurementSummary> {
  const res = await authFetch('/reports/procurement-summary');
  return res.json();
}

export async function getProcurementByDepartment(): Promise<DepartmentProcurement[]> {
  const res = await authFetch('/reports/procurement-by-department');
  return res.json();
}

export async function getProcurementByCategory(): Promise<CategoryBreakdown[]> {
  const res = await authFetch('/reports/procurement-by-category');
  return res.json();
}

export async function getBudgetUtilization(fiscalYearId?: string): Promise<BudgetUtilization[]> {
  const qs = fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : '';
  const res = await authFetch(`/reports/budget-utilization${qs}`);
  return res.json();
}

export async function getMonthlyProcurement(): Promise<MonthlyProcurement[]> {
  const res = await authFetch('/reports/monthly-procurement');
  return res.json();
}

export async function getSupplierActivity(): Promise<SupplierActivity[]> {
  const res = await authFetch('/reports/supplier-activity');
  return res.json();
}

export async function getFiscalYears(): Promise<FiscalYearOption[]> {
  const res = await authFetch('/reports/fiscal-years');
  return res.json();
}
