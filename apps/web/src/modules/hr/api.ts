import type {
  AllowanceType,
  DeductionType,
  DtrRecord,
  DtrUpload,
  Employee,
  EmployeeAllowance,
  EmployeeDeduction,
  LeaveApplication,
  LeaveBalance,
  LeaveType,
  PayrollPeriod,
  PayrollRun,
  Position,
  RemittanceAgencyDetail,
  RemittanceSummary,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

export class HrApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HrApiError';
  }
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
  if (response.status === 401)
    throw new HrApiError('Not signed in, or your session has expired.', 401);
  if (response.status === 403)
    throw new HrApiError('You do not have permission to view this.', 403);
  if (response.status === 404) throw new HrApiError('Not found.', 404);
  if (!response.ok) throw new HrApiError(`Request failed (${response.status}).`, response.status);
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
  if (response.status === 401) throw new HrApiError('Not signed in.', 401);
  if (response.status === 403)
    throw new HrApiError(await extractErrorMessage(response, 'Forbidden.'), 403);
  if (response.status === 404) throw new HrApiError('Not found.', 404);
  if (response.status === 409)
    throw new HrApiError(
      await extractErrorMessage(response, 'Modified concurrently — reload.'),
      409,
    );
  if (response.status === 400)
    throw new HrApiError(await extractErrorMessage(response, 'Invalid request.'), 400);
  if (!response.ok)
    throw new HrApiError(
      await extractErrorMessage(response, `Failed (${response.status}).`),
      response.status,
    );
  return response;
}

async function authFetchFormData(path: string, formData: FormData): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (response.status === 401) throw new HrApiError('Not signed in.', 401);
  if (response.status === 403)
    throw new HrApiError(await extractErrorMessage(response, 'Forbidden.'), 403);
  if (response.status === 400)
    throw new HrApiError(await extractErrorMessage(response, 'Invalid request.'), 400);
  if (!response.ok)
    throw new HrApiError(
      await extractErrorMessage(response, `Failed (${response.status}).`),
      response.status,
    );
  return response;
}

// ── Employees ──

export async function getEmployees(params?: string): Promise<Employee[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/employees${qs}`);
  return res.json();
}

export async function getEmployee(id: string): Promise<Employee> {
  const res = await authFetch(`/hr/employees/${id}`);
  return res.json();
}

export async function createEmployee(data: Record<string, unknown>): Promise<Employee> {
  const res = await authFetchMutate('/hr/employees', 'POST', data);
  return res.json();
}

export async function updateEmployee(id: string, data: Record<string, unknown>): Promise<Employee> {
  const res = await authFetchMutate(`/hr/employees/${id}`, 'PATCH', data);
  return res.json();
}

// ── Positions ──

export async function getPositions(): Promise<Position[]> {
  const res = await authFetch('/hr/positions');
  return res.json();
}

export async function createPosition(data: Record<string, unknown>): Promise<Position> {
  const res = await authFetchMutate('/hr/positions', 'POST', data);
  return res.json();
}

export async function updatePosition(id: string, data: Record<string, unknown>): Promise<Position> {
  const res = await authFetchMutate(`/hr/positions/${id}`, 'PATCH', data);
  return res.json();
}

// ── Lookups ──

export async function getDepartments(): Promise<Array<{ id: string; code: string; name: string }>> {
  const res = await authFetch('/hr/lookups/departments');
  return res.json();
}

export async function getUsers(): Promise<Array<{ id: string; username: string; email: string }>> {
  const res = await authFetch('/hr/lookups/users');
  return res.json();
}

// ── Leave ──

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const res = await authFetch('/hr/leave/types');
  return res.json();
}

export async function getLeaveBalances(employeeId: string, year?: number): Promise<LeaveBalance[]> {
  const qs = year ? `?year=${year}` : '';
  const res = await authFetch(`/hr/leave/balances/${employeeId}${qs}`);
  return res.json();
}

export async function initLeaveBalances(
  employeeId: string,
  year: number,
): Promise<{ created: number }> {
  const res = await authFetchMutate('/hr/leave/balances/init', 'POST', { employeeId, year });
  return res.json();
}

export async function getLeaveApplications(params?: string): Promise<LeaveApplication[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/leave/applications${qs}`);
  return res.json();
}

export async function getLeaveApplication(id: string): Promise<LeaveApplication> {
  const res = await authFetch(`/hr/leave/applications/${id}`);
  return res.json();
}

export async function createLeaveApplication(
  data: Record<string, unknown>,
): Promise<LeaveApplication> {
  const res = await authFetchMutate('/hr/leave/applications', 'POST', data);
  return res.json();
}

export async function approveLeave(id: string, expectedVersion: number): Promise<LeaveApplication> {
  const res = await authFetchMutate(`/hr/leave/applications/${id}/approve`, 'PATCH', {
    expectedVersion,
  });
  return res.json();
}

export async function rejectLeave(
  id: string,
  expectedVersion: number,
  rejectionReason: string,
): Promise<LeaveApplication> {
  const res = await authFetchMutate(`/hr/leave/applications/${id}/reject`, 'PATCH', {
    expectedVersion,
    rejectionReason,
  });
  return res.json();
}

export async function cancelLeave(id: string, expectedVersion: number): Promise<LeaveApplication> {
  const res = await authFetchMutate(`/hr/leave/applications/${id}/cancel`, 'PATCH', {
    expectedVersion,
  });
  return res.json();
}

// ── DTR ──

export async function getDtrRecords(params?: string): Promise<DtrRecord[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/dtr/records${qs}`);
  return res.json();
}

export async function createDtrRecord(data: Record<string, unknown>): Promise<DtrRecord> {
  const res = await authFetchMutate('/hr/dtr/records', 'POST', data);
  return res.json();
}

export async function getDtrUploads(): Promise<DtrUpload[]> {
  const res = await authFetch('/hr/dtr/uploads');
  return res.json();
}

export async function uploadDtrExcel(
  file: File,
  periodStart: string,
  periodEnd: string,
): Promise<DtrUpload> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('periodStart', periodStart);
  formData.append('periodEnd', periodEnd);
  const res = await authFetchFormData('/hr/dtr/upload', formData);
  return res.json();
}

// ── Compensation ──

export async function getAllowanceTypes(): Promise<AllowanceType[]> {
  const res = await authFetch('/hr/compensation/allowance-types');
  return res.json();
}

export async function createAllowanceType(data: Record<string, unknown>): Promise<AllowanceType> {
  const res = await authFetchMutate('/hr/compensation/allowance-types', 'POST', data);
  return res.json();
}

export async function updateAllowanceType(
  id: string,
  data: Record<string, unknown>,
): Promise<AllowanceType> {
  const res = await authFetchMutate(`/hr/compensation/allowance-types/${id}`, 'PATCH', data);
  return res.json();
}

export async function getDeductionTypes(): Promise<DeductionType[]> {
  const res = await authFetch('/hr/compensation/deduction-types');
  return res.json();
}

export async function createDeductionType(data: Record<string, unknown>): Promise<DeductionType> {
  const res = await authFetchMutate('/hr/compensation/deduction-types', 'POST', data);
  return res.json();
}

export async function updateDeductionType(
  id: string,
  data: Record<string, unknown>,
): Promise<DeductionType> {
  const res = await authFetchMutate(`/hr/compensation/deduction-types/${id}`, 'PATCH', data);
  return res.json();
}

export async function getEmployeeAllowances(employeeId: string): Promise<EmployeeAllowance[]> {
  const res = await authFetch(`/hr/compensation/employee-allowances/${employeeId}`);
  return res.json();
}

export async function createEmployeeAllowance(
  data: Record<string, unknown>,
): Promise<EmployeeAllowance> {
  const res = await authFetchMutate('/hr/compensation/employee-allowances', 'POST', data);
  return res.json();
}

export async function updateEmployeeAllowance(
  id: string,
  data: Record<string, unknown>,
): Promise<EmployeeAllowance> {
  const res = await authFetchMutate(`/hr/compensation/employee-allowances/${id}`, 'PATCH', data);
  return res.json();
}

export async function getEmployeeDeductions(employeeId: string): Promise<EmployeeDeduction[]> {
  const res = await authFetch(`/hr/compensation/employee-deductions/${employeeId}`);
  return res.json();
}

export async function createEmployeeDeduction(
  data: Record<string, unknown>,
): Promise<EmployeeDeduction> {
  const res = await authFetchMutate('/hr/compensation/employee-deductions', 'POST', data);
  return res.json();
}

export async function updateEmployeeDeduction(
  id: string,
  data: Record<string, unknown>,
): Promise<EmployeeDeduction> {
  const res = await authFetchMutate(`/hr/compensation/employee-deductions/${id}`, 'PATCH', data);
  return res.json();
}

// ── Payroll ──

export async function getPayrollPeriods(params?: string): Promise<PayrollPeriod[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/payroll/periods${qs}`);
  return res.json();
}

export async function createPayrollPeriod(data: Record<string, unknown>): Promise<PayrollPeriod> {
  const res = await authFetchMutate('/hr/payroll/periods', 'POST', data);
  return res.json();
}

export async function lockPayrollPeriod(
  id: string,
  expectedVersion: number,
): Promise<PayrollPeriod> {
  const res = await authFetchMutate(`/hr/payroll/periods/${id}/lock`, 'PATCH', { expectedVersion });
  return res.json();
}

export async function getPayrollRuns(params?: string): Promise<PayrollRun[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/payroll/runs${qs}`);
  return res.json();
}

export async function getPayrollRun(id: string): Promise<PayrollRun> {
  const res = await authFetch(`/hr/payroll/runs/${id}`);
  return res.json();
}

export async function createPayrollRun(data: Record<string, unknown>): Promise<PayrollRun> {
  const res = await authFetchMutate('/hr/payroll/runs', 'POST', data);
  return res.json();
}

export async function computePayroll(id: string, expectedVersion: number): Promise<PayrollRun> {
  const res = await authFetchMutate(`/hr/payroll/runs/${id}/compute`, 'PATCH', { expectedVersion });
  return res.json();
}

export async function approvePayroll(id: string, expectedVersion: number): Promise<PayrollRun> {
  const res = await authFetchMutate(`/hr/payroll/runs/${id}/approve`, 'PATCH', { expectedVersion });
  return res.json();
}

export async function payPayroll(id: string, expectedVersion: number): Promise<PayrollRun> {
  const res = await authFetchMutate(`/hr/payroll/runs/${id}/pay`, 'PATCH', { expectedVersion });
  return res.json();
}

export async function voidPayroll(
  id: string,
  expectedVersion: number,
  voidReason: string,
): Promise<PayrollRun> {
  const res = await authFetchMutate(`/hr/payroll/runs/${id}/void`, 'PATCH', {
    expectedVersion,
    voidReason,
  });
  return res.json();
}

// ── Remittances ──

export async function getRemittanceSummary(params?: string): Promise<RemittanceSummary> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/remittances/summary${qs}`);
  return res.json();
}

export async function getRemittanceAgencyDetail(
  code: string,
  params?: string,
): Promise<RemittanceAgencyDetail> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/remittances/agency/${code}${qs}`);
  return res.json();
}

// ── Reports ──

export async function getEmployeeRoster(params?: string): Promise<any[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/reports/employee-roster${qs}`);
  return res.json();
}

export async function getPayrollRegister(runId: string): Promise<any> {
  const res = await authFetch(`/hr/reports/payroll-register/${runId}`);
  return res.json();
}

export async function getLeaveSummary(params?: string): Promise<any> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/reports/leave-summary${qs}`);
  return res.json();
}

export async function getPayslip(itemId: string): Promise<any> {
  const res = await authFetch(`/hr/reports/payslip/${itemId}`);
  return res.json();
}

export async function getAttendanceSummary(params?: string): Promise<any> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/hr/reports/attendance-summary${qs}`);
  return res.json();
}

// ── Dashboard ──

export async function getHrDashboard(): Promise<any> {
  const res = await authFetch('/hr/dashboard');
  return res.json();
}
