import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getHrDashboard, HrApiError } from '../api';
import type { PayrollStatus } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function fmtDate(d: string | null) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_COLORS: Record<PayrollStatus, string> = {
  draft: 'pending',
  computing: 'pending',
  computed: 'contractual',
  reviewing: 'casual',
  approved: 'active',
  paid: 'permanent',
  voided: 'resigned',
};

export default function HrDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getHrDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="hr-page">
        <HrSubNav />
        <p>Loading dashboard...</p>
      </div>
    );
  if (error)
    return (
      <div className="hr-page">
        <HrSubNav />
        <div className="hr-error">{error}</div>
      </div>
    );
  if (!data) return null;

  return (
    <div className="hr-page">
      <HrSubNav />

      {/* Stat Cards */}
      <div className="hr-dash-grid">
        <Link to="/hr/employees" className="hr-dash-card">
          <div className="hr-dash-card__label">Total Employees</div>
          <div className="hr-dash-card__value">{data.totalEmployees}</div>
        </Link>
        <Link to="/hr/employees" className="hr-dash-card">
          <div className="hr-dash-card__label">Active</div>
          <div className="hr-dash-card__value hr-dash-card__value--green">
            {data.activeEmployees}
          </div>
        </Link>
        <Link to="/hr/leave" className="hr-dash-card">
          <div className="hr-dash-card__label">On Leave</div>
          <div className="hr-dash-card__value hr-dash-card__value--amber">{data.onLeaveCount}</div>
        </Link>
        <Link to="/hr/leave" className="hr-dash-card">
          <div className="hr-dash-card__label">Pending Leave Requests</div>
          <div className="hr-dash-card__value hr-dash-card__value--red">
            {data.pendingLeaveApps}
          </div>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginTop: 20 }}>
        {/* Recent Payroll Runs */}
        <div>
          <h3 className="hr-dash-section-title">Recent Payroll Runs</h3>
          {data.recentPayrollRuns.length === 0 && (
            <div className="hr-empty">No payroll runs yet.</div>
          )}
          {data.recentPayrollRuns.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Run #</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Employees</th>
                    <th style={{ textAlign: 'right' }}>Net Pay</th>
                    <th>Pay Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPayrollRuns.map((run: any) => (
                    <tr key={run.id}>
                      <td>
                        <Link to="/hr/payroll" className="hr-link">
                          {run.runNumber}
                        </Link>
                      </td>
                      <td>{run.payrollPeriod.name}</td>
                      <td>
                        <span
                          className={`hr-badge hr-badge--${STATUS_COLORS[run.status as PayrollStatus] ?? 'pending'}`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{run.employeeCount}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPeso(run.totalNet)}
                      </td>
                      <td>{fmtDate(run.payrollPeriod.payDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Department & Status Breakdown */}
        <div>
          <h3 className="hr-dash-section-title">By Department</h3>
          {data.departmentBreakdown.length === 0 && <div className="hr-empty">No departments.</div>}
          {data.departmentBreakdown.length > 0 && (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {data.departmentBreakdown.map((d: any) => (
                  <tr key={d.department}>
                    <td>{d.department}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="hr-dash-section-title" style={{ marginTop: 20 }}>
            By Status
          </h3>
          {data.statusBreakdown.length === 0 && <div className="hr-empty">No data.</div>}
          {data.statusBreakdown.length > 0 && (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {data.statusBreakdown.map((s: any) => (
                  <tr key={s.status}>
                    <td>
                      <span
                        className={`hr-badge hr-badge--${s.status === 'active' ? 'active' : 'resigned'}`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
