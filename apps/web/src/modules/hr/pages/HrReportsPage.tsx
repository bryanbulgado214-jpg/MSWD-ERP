import { Fragment, useEffect, useState } from 'react';

import {
  getEmployeeRoster, getPayrollRegister, getLeaveSummary, getAttendanceSummary,
  getPayrollRuns, getDepartments, HrApiError,
} from '../api';
import type { PayrollRun } from '../types';
import HrSubNav from './HrSubNav';
import './hr.css';

type ReportType = 'roster' | 'payroll-register' | 'leave-summary' | 'attendance';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function fmtDate(d: string | null) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function HrReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('roster');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRunId, setFilterRunId] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => {});
    getPayrollRuns().then(setRuns).catch(() => {});
  }, []);

  function loadReport() {
    setLoading(true);
    setError('');
    setData(null);

    let promise: Promise<any>;
    switch (reportType) {
      case 'roster': {
        const params: string[] = [];
        if (filterDeptId) params.push(`departmentId=${filterDeptId}`);
        if (filterStatus) params.push(`status=${filterStatus}`);
        promise = getEmployeeRoster(params.length ? params.join('&') : undefined);
        break;
      }
      case 'payroll-register': {
        if (!filterRunId) {
          setError('Please select a payroll run.');
          setLoading(false);
          return;
        }
        promise = getPayrollRegister(filterRunId);
        break;
      }
      case 'leave-summary':
        promise = getLeaveSummary(`year=${filterYear}`);
        break;
      case 'attendance':
        promise = getAttendanceSummary(`month=${filterMonth}&year=${filterYear}`);
        break;
      default:
        return;
    }

    promise
      .then(setData)
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed to load report.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setData(null);
    setError('');
  }, [reportType]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="hr-page">
      <HrSubNav />

      <div className="hr-toolbar">
        <div className="hr-toolbar__filters" style={{ flexWrap: 'wrap', gap: 8 }}>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} style={{ padding: '6px 10px', fontWeight: 600 }}>
            <option value="roster">Employee Roster</option>
            <option value="payroll-register">Payroll Register</option>
            <option value="leave-summary">Leave Summary</option>
            <option value="attendance">Attendance Summary</option>
          </select>

          {reportType === 'roster' && (
            <Fragment>
              <select value={filterDeptId} onChange={(e) => setFilterDeptId(e.target.value)} style={{ padding: '6px 10px' }}>
                <option value="">All Departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px' }}>
                <option value="">Active Only</option>
                <option value="active">Active</option>
                <option value="resigned">Resigned</option>
                <option value="retired">Retired</option>
                <option value="terminated">Terminated</option>
                <option value="on_leave">On Leave</option>
                <option value="suspended">Suspended</option>
              </select>
            </Fragment>
          )}

          {reportType === 'payroll-register' && (
            <select value={filterRunId} onChange={(e) => setFilterRunId(e.target.value)} style={{ padding: '6px 10px' }}>
              <option value="">Select payroll run...</option>
              {runs.filter((r) => r.status !== 'draft').map((r) => (
                <option key={r.id} value={r.id}>{r.runNumber} — {r.payrollPeriod.name} ({r.status})</option>
              ))}
            </select>
          )}

          {(reportType === 'leave-summary' || reportType === 'attendance') && (
            <Fragment>
              <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} style={{ padding: '6px 10px' }}>
                {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {reportType === 'attendance' && (
                <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} style={{ padding: '6px 10px' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              )}
            </Fragment>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="hr-btn hr-btn--primary" onClick={loadReport} disabled={loading}>
            {loading ? 'Loading...' : 'Generate'}
          </button>
          {data && (
            <button type="button" className="hr-btn" onClick={handlePrint}>Print</button>
          )}
        </div>
      </div>

      {error && <div className="hr-error">{error}</div>}
      {loading && <p>Loading report...</p>}

      {/* Employee Roster */}
      {reportType === 'roster' && Array.isArray(data) && (
        <div className="hr-report-print">
          <h3 className="hr-report-title">Employee Roster</h3>
          <p className="hr-report-subtitle">{data.length} employee(s)</p>
          {data.length === 0 && <div className="hr-empty">No employees found.</div>}
          {data.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Emp #</th><th>Name</th><th>Department</th><th>Position</th>
                    <th>Status</th><th>Hired</th><th style={{ textAlign: 'right' }}>Basic Salary</th>
                    <th>SG/Step</th><th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((emp: any) => (
                    <tr key={emp.id}>
                      <td className="hr-text-mono">{emp.employeeNumber}</td>
                      <td>{emp.lastName}, {emp.firstName} {emp.middleName ?? ''} {emp.suffix ?? ''}</td>
                      <td>{emp.department?.name ?? '--'}</td>
                      <td>{emp.position?.title ?? '--'}</td>
                      <td><span className={`hr-badge hr-badge--${emp.employmentStatus === 'active' ? 'active' : 'resigned'}`}>{emp.employmentStatus}</span></td>
                      <td>{fmtDate(emp.dateHired)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(emp.basicSalary)}</td>
                      <td>{emp.salaryGrade ?? '--'}/{emp.salaryStep ?? '--'}</td>
                      <td>{emp.contactNumber ?? emp.email ?? '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payroll Register */}
      {reportType === 'payroll-register' && data && !Array.isArray(data) && (
        <div className="hr-report-print">
          <h3 className="hr-report-title">Payroll Register — {data.runNumber}</h3>
          <p className="hr-report-subtitle">
            {data.payrollPeriod?.name} | {fmtDate(data.payrollPeriod?.startDate)} – {fmtDate(data.payrollPeriod?.endDate)} | Pay Date: {fmtDate(data.payrollPeriod?.payDate)}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="hr-form" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#98a2b3', textTransform: 'uppercase' }}>Employees</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{data.employeeCount}</div>
            </div>
            <div className="hr-form" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#98a2b3', textTransform: 'uppercase' }}>Total Gross</div>
              <div className="hr-text-mono" style={{ fontSize: 16, fontWeight: 700 }}>{formatPeso(data.totalGross)}</div>
            </div>
            <div className="hr-form" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#98a2b3', textTransform: 'uppercase' }}>Total Deductions</div>
              <div className="hr-text-mono" style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{formatPeso(data.totalDeductions)}</div>
            </div>
            <div className="hr-form" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#98a2b3', textTransform: 'uppercase' }}>Total Net</div>
              <div className="hr-text-mono" style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{formatPeso(data.totalNet)}</div>
            </div>
          </div>

          {data.items && data.items.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Emp #</th><th>Name</th><th>Department</th><th>Position</th>
                    <th style={{ textAlign: 'right' }}>Basic Pay</th>
                    <th style={{ textAlign: 'right' }}>Allowances</th>
                    <th style={{ textAlign: 'right' }}>OT Pay</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Deductions</th>
                    <th style={{ textAlign: 'right' }}>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="hr-text-mono">{item.employee.employeeNumber}</td>
                      <td>{item.employee.lastName}, {item.employee.firstName}</td>
                      <td>{item.employee.department?.name ?? '--'}</td>
                      <td>{item.employee.position?.title ?? '--'}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(item.basicPay)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(item.totalAllowances)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(item.overtimePay)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(item.grossPay)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(item.totalDeductions)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatPeso(item.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={4}>TOTAL</td>
                    <td style={{ textAlign: 'right' }}></td>
                    <td style={{ textAlign: 'right' }}></td>
                    <td style={{ textAlign: 'right' }}></td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(data.totalGross)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(data.totalDeductions)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(data.totalNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {data.approver && <p style={{ fontSize: 12, marginTop: 12, color: '#475467' }}>Approved by: {data.approver.username}</p>}
          {data.creator && <p style={{ fontSize: 12, color: '#475467' }}>Prepared by: {data.creator.username}</p>}
        </div>
      )}

      {/* Leave Summary */}
      {reportType === 'leave-summary' && data && data.balances && (
        <div className="hr-report-print">
          <h3 className="hr-report-title">Leave Summary — {data.year}</h3>
          <p className="hr-report-subtitle">{data.balances.length} balance record(s)</p>
          {data.balances.length === 0 && <div className="hr-empty">No leave balances found for {data.year}.</div>}
          {data.balances.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Emp #</th><th>Name</th><th>Department</th><th>Leave Type</th>
                    <th style={{ textAlign: 'right' }}>Entitled</th>
                    <th style={{ textAlign: 'right' }}>Used</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.balances.map((b: any, i: number) => (
                    <tr key={i}>
                      <td className="hr-text-mono">{b.employee.employeeNumber}</td>
                      <td>{b.employee.lastName}, {b.employee.firstName}</td>
                      <td>{b.employee.department?.name ?? '--'}</td>
                      <td>{b.leaveType.name}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{Number(b.entitled)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{Number(b.used)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{Number(b.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Attendance Summary */}
      {reportType === 'attendance' && data && data.employees && (
        <div className="hr-report-print">
          <h3 className="hr-report-title">Attendance Summary — {MONTHS[data.month - 1]} {data.year}</h3>
          <p className="hr-report-subtitle">{data.employees.length} employee(s)</p>
          {data.employees.length === 0 && <div className="hr-empty">No employees found.</div>}
          {data.employees.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Emp #</th><th>Name</th><th>Department</th>
                    <th style={{ textAlign: 'right' }}>DTR Records</th>
                    <th style={{ textAlign: 'right' }}>Days Present</th>
                    <th style={{ textAlign: 'right' }}>Days Absent</th>
                    <th style={{ textAlign: 'right' }}>Late (hrs)</th>
                    <th style={{ textAlign: 'right' }}>Undertime (hrs)</th>
                    <th style={{ textAlign: 'right' }}>Overtime (hrs)</th>
                    <th style={{ textAlign: 'right' }}>Hours Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp: any) => (
                    <tr key={emp.id}>
                      <td className="hr-text-mono">{emp.employeeNumber}</td>
                      <td>{emp.lastName}, {emp.firstName}</td>
                      <td>{emp.department?.name ?? '--'}</td>
                      <td style={{ textAlign: 'right' }}>{emp.dtrCount}</td>
                      <td style={{ textAlign: 'right' }}>{emp.daysPresent}</td>
                      <td style={{ textAlign: 'right' }}>{emp.daysAbsent}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{emp.totalLate}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{emp.totalUndertime}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{emp.totalOvertime}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{emp.totalHoursWorked}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={3}>TOTALS</td>
                    <td style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.dtrCount, 0)}</td>
                    <td style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.daysPresent, 0)}</td>
                    <td style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.daysAbsent, 0)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.totalLate, 0)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.totalUndertime, 0)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.totalOvertime, 0)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{data.employees.reduce((s: number, e: any) => s + e.totalHoursWorked, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
