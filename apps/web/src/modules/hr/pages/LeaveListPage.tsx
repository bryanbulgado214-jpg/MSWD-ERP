import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  getLeaveApplications,
  getEmployees,
  approveLeave,
  rejectLeave,
  cancelLeave,
  HrApiError,
} from '../api';
import type { LeaveApplication, Employee } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: LeaveApplication[] };

const STATUS_COLORS: Record<string, string> = {
  pending: 'on_leave',
  approved: 'active',
  rejected: 'terminated',
  cancelled: 'resigned',
};

export default function LeaveListPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionError, setActionError] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectVersion, setRejectVersion] = useState(0);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  function load() {
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    if (employeeFilter) params.set('employeeId', employeeFilter);
    if (statusFilter) params.set('status', statusFilter);
    getLeaveApplications(params.toString() || undefined)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof HrApiError ? err.message : 'Failed.' }),
      );
  }

  useEffect(() => {
    load();
  }, [employeeFilter, statusFilter]);
  useEffect(() => {
    getEmployees()
      .then(setEmployees)
      .catch(() => {});
  }, []);

  async function handleApprove(id: string, version: number) {
    setActing(true);
    setActionError('');
    try {
      await approveLeave(id, version);
      load();
    } catch (err) {
      setActionError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!rejectId || !rejectReason.trim()) return;
    setActing(true);
    setActionError('');
    try {
      await rejectLeave(rejectId, rejectVersion, rejectReason);
      setRejectId(null);
      setRejectReason('');
      load();
    } catch (err) {
      setActionError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setActing(false);
    }
  }

  async function handleCancel(id: string, version: number) {
    setActing(true);
    setActionError('');
    try {
      await cancelLeave(id, version);
      load();
    } catch (err) {
      setActionError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <div className="hr-toolbar__filters">
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.lastName}, {emp.firstName}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {hasPermission('hr.leave.manage') && (
          <Link to="/hr/leave/new" className="hr-btn hr-btn--primary">
            + New Leave
          </Link>
        )}
      </div>

      {actionError && <div className="hr-error">{actionError}</div>}

      {rejectId && (
        <div
          className="hr-form"
          style={{
            marginBottom: 16,
            padding: 16,
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: 8,
          }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Reject Leave Application</h3>
          <div className="hr-field">
            <label>Reason for Rejection *</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="hr-form-actions">
            <button
              type="button"
              className="hr-btn"
              onClick={() => {
                setRejectId(null);
                setRejectReason('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hr-btn hr-btn--danger"
              disabled={acting || !rejectReason.trim()}
              onClick={handleReject}
            >
              {acting ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      )}

      {state.status === 'loading' && <p>Loading...</p>}
      {state.status === 'error' && <div className="hr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="hr-empty">No leave applications found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>Start</th>
                <th>End</th>
                <th style={{ textAlign: 'right' }}>Days</th>
                <th>Status</th>
                <th>Filed</th>
                {(hasPermission('hr.leave.approve') || hasPermission('hr.leave.manage')) && (
                  <th>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {state.data.map((app) => (
                <tr key={app.id}>
                  <td>
                    <Link to={`/hr/employees/${app.employee.id}`} className="hr-table__link">
                      {app.employee.lastName}, {app.employee.firstName}
                    </Link>
                  </td>
                  <td>{app.leaveType.name}</td>
                  <td>{new Date(app.startDate).toLocaleDateString()}</td>
                  <td>{new Date(app.endDate).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(app.daysApplied)}</td>
                  <td>
                    <span
                      className={`hr-badge hr-badge--${STATUS_COLORS[app.status] ?? app.status}`}
                    >
                      {app.status}
                    </span>
                  </td>
                  <td>{new Date(app.createdAt).toLocaleDateString()}</td>
                  {(hasPermission('hr.leave.approve') || hasPermission('hr.leave.manage')) && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {app.status === 'pending' && hasPermission('hr.leave.approve') && (
                          <>
                            <button
                              type="button"
                              className="hr-btn hr-btn--success"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              disabled={acting}
                              onClick={() => handleApprove(app.id, app.version)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="hr-btn hr-btn--danger"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              disabled={acting}
                              onClick={() => {
                                setRejectId(app.id);
                                setRejectVersion(app.version);
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {(app.status === 'pending' || app.status === 'approved') &&
                          hasPermission('hr.leave.manage') && (
                            <button
                              type="button"
                              className="hr-btn"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              disabled={acting}
                              onClick={() => handleCancel(app.id, app.version)}
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
