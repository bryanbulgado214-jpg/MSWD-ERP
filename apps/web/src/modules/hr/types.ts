export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  civilStatus: string | null;
  address: string | null;
  contactNumber: string | null;
  email: string | null;
  tin: string | null;
  sssGsisNumber: string | null;
  philhealthNumber: string | null;
  pagibigNumber: string | null;
  departmentId: string | null;
  positionId: string | null;
  userId: string | null;
  employmentType: string;
  employmentStatus: string;
  dateHired: string | null;
  dateRegularized: string | null;
  dateSeparated: string | null;
  separationReason: string | null;
  basicSalary: string | null;
  salaryGrade: number | null;
  salaryStep: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  department: { id: string; code: string; name: string } | null;
  position: { id: string; code: string; title: string } | null;
  user: { id: string; username: string } | null;
  creator?: { id: string; username: string } | null;
  updater?: { id: string; username: string } | null;
}

export interface Position {
  id: string;
  code: string;
  title: string;
  salaryGrade: number | null;
  salaryStep: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { employees: number };
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  defaultDays: string;
  isConvertible: boolean;
  isCumulative: boolean;
  maxAccumulation: string | null;
  isActive: boolean;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  earned: string;
  used: string;
  balance: string;
  carryOver: string;
  leaveType: { id: string; code: string; name: string };
}

export interface LeaveApplication {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  daysApplied: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  version: number;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
  leaveType: { id: string; code: string; name: string };
  approver: { id: string; username: string } | null;
}

export interface DtrRecord {
  id: string;
  employeeId: string;
  uploadId: string | null;
  recordDate: string;
  timeInAm: string | null;
  timeOutAm: string | null;
  timeInPm: string | null;
  timeOutPm: string | null;
  hoursWorked: string;
  hoursLate: string;
  hoursUndertime: string;
  hoursOvertime: string;
  isAbsent: boolean;
  isHoliday: boolean;
  isRestDay: boolean;
  remarks: string | null;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
}

export interface AllowanceType {
  id: string;
  code: string;
  name: string;
  isTaxable: boolean;
  isFixed: boolean;
  defaultAmount: string;
  isActive: boolean;
  _count: { employeeAllowances: number };
}

export interface DeductionType {
  id: string;
  code: string;
  name: string;
  category: string;
  isPercentage: boolean;
  employerShare: string;
  employeeShare: string;
  isActive: boolean;
  _count: { employeeDeductions: number };
}

export interface EmployeeAllowance {
  id: string;
  employeeId: string;
  allowanceTypeId: string;
  amount: string;
  effectiveDate: string;
  endDate: string | null;
  isActive: boolean;
  allowanceType: { id: string; code: string; name: string; isTaxable: boolean };
}

export interface EmployeeDeduction {
  id: string;
  employeeId: string;
  deductionTypeId: string;
  amount: string;
  startDate: string | null;
  endDate: string | null;
  remainingBalance: string | null;
  isActive: boolean;
  remarks: string | null;
  deductionType: { id: string; code: string; name: string; category: string; isPercentage: boolean };
}

export interface DtrUpload {
  id: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  totalRecords: number;
  processedRecords: number;
  errorRecords: number;
  status: 'pending' | 'processed' | 'error';
  errorLog: string | null;
  createdAt: string;
  uploader: { id: string; username: string } | null;
}

export interface PayrollPeriod {
  id: string;
  name: string;
  periodType: string;
  startDate: string;
  endDate: string;
  payDate: string;
  isLocked: boolean;
  version: number;
  createdAt: string;
  creator: { id: string; username: string } | null;
  _count: { payrollRuns: number };
}

export type PayrollStatus = 'draft' | 'computing' | 'computed' | 'reviewing' | 'approved' | 'paid' | 'voided';

export interface PayrollRun {
  id: string;
  runNumber: string;
  status: PayrollStatus;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  employeeCount: number;
  computedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  remarks: string | null;
  version: number;
  createdAt: string;
  payrollPeriod: { id: string; name: string; startDate: string; endDate: string; payDate: string };
  creator: { id: string; username: string } | null;
  approver: { id: string; username: string } | null;
  voider?: { id: string; username: string } | null;
  _count: { items: number };
  items?: PayrollItem[];
}

export interface PayrollItem {
  id: string;
  basicPay: string;
  totalAllowances: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  daysWorked: string;
  daysAbsent: string;
  hoursLate: string;
  hoursUndertime: string;
  hoursOvertime: string;
  lateDeduction: string;
  undertimeDeduction: string;
  overtimePay: string;
  absentDeduction: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string; basicSalary: string | null };
  details: PayrollItemDetail[];
}

export interface PayrollItemDetail {
  id: string;
  detailType: string;
  referenceCode: string;
  referenceName: string;
  amount: string;
  employerShare: string;
  remarks: string | null;
}

export interface RemittanceSummary {
  runs: Array<{ id: string; runNumber: string; status: string; periodName: string }>;
  agencies: Array<{
    code: string;
    name: string;
    totalEmployee: number;
    totalEmployer: number;
    employeeCount: number;
    employees: Array<{
      employeeId: string;
      employeeNumber: string;
      employeeName: string;
      payrollRunId: string;
      employeeShare: number;
      employerShare: number;
      total: number;
    }>;
  }>;
}

export interface RemittanceAgencyDetail {
  agencyCode: string;
  agencyName: string;
  records: Array<{
    employeeNumber: string;
    employeeName: string;
    membershipNumber: string | null;
    runNumber: string;
    periodName: string;
    employeeShare: number;
    employerShare: number;
    total: number;
  }>;
}
