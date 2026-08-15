import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getEmployees,
  getLeaveTypes,
  getLeaveBalances,
  createLeaveApplication,
  HrApiError,
} from '../api';
import type { Employee, LeaveType, LeaveBalance } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

export default function LeaveNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);

  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysApplied, setDaysApplied] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    getEmployees()
      .then(setEmployees)
      .catch(() => {});
    getLeaveTypes()
      .then(setLeaveTypes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (employeeId) {
      getLeaveBalances(employeeId)
        .then(setBalances)
        .catch(() => setBalances([]));
    } else {
      setBalances([]);
    }
  }, [employeeId]);

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end >= start) {
        let count = 0;
        const curr = new Date(start);
        while (curr <= end) {
          const day = curr.getDay();
          if (day !== 0 && day !== 6) count++;
          curr.setDate(curr.getDate() + 1);
        }
        setDaysApplied(String(count));
      }
    }
  }, [startDate, endDate]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await createLeaveApplication({
        employeeId,
        leaveTypeId,
        startDate,
        endDate,
        daysApplied: Number(daysApplied),
        ...(reason ? { reason } : {}),
      });
      navigate('/hr/leave');
    } catch (err) {
      setFormError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId);

  return (
    <div className="hr-page">
      <HrSubNav />
      <h1>New Leave Application</h1>

      <form className="hr-form" onSubmit={handleSubmit}>
        {formError && <div className="hr-error">{formError}</div>}

        <fieldset className="hr-fieldset">
          <legend>Leave Details</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="hr-field">
              <label>Employee *</label>
              <select
                required
                value={employeeId}
                onChange={(ev) => setEmployeeId(ev.target.value)}
                style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
              >
                <option value="">-- Select Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName}, {emp.firstName} ({emp.employeeNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="hr-field">
              <label>Leave Type *</label>
              <select
                required
                value={leaveTypeId}
                onChange={(ev) => setLeaveTypeId(ev.target.value)}
                style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
              >
                <option value="">-- Select Type --</option>
                {leaveTypes
                  .filter((lt) => lt.isActive)
                  .map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {selectedBalance && (
            <div
              className="hr-info-box"
              style={{
                margin: '8px 0',
                padding: '8px 12px',
                background: 'var(--bg-info, #f0f4ff)',
                borderRadius: 6,
                fontSize: '13px',
              }}
            >
              Balance: <strong>{Number(selectedBalance.balance)} days</strong> (Earned:{' '}
              {Number(selectedBalance.earned)}, Used: {Number(selectedBalance.used)}, Carry-over:{' '}
              {Number(selectedBalance.carryOver)})
            </div>
          )}
          {employeeId && balances.length === 0 && (
            <div
              className="hr-info-box"
              style={{
                margin: '8px 0',
                padding: '8px 12px',
                background: 'var(--bg-warning, #fff8e1)',
                borderRadius: 6,
                fontSize: '13px',
              }}
            >
              No leave balances found for this year. Balances will be initialized automatically upon
              approval.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '12px' }}>
            <div className="hr-field">
              <label>Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(ev) => setStartDate(ev.target.value)}
              />
            </div>
            <div className="hr-field">
              <label>End Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(ev) => setEndDate(ev.target.value)}
              />
            </div>
            <div className="hr-field">
              <label>Days *</label>
              <input
                type="number"
                required
                step="0.5"
                min="0.5"
                value={daysApplied}
                onChange={(ev) => setDaysApplied(ev.target.value)}
              />
            </div>
          </div>

          <div className="hr-field">
            <label>Reason</label>
            <textarea rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} />
          </div>
        </fieldset>

        <div className="hr-form-actions">
          <button type="button" className="hr-btn" onClick={() => navigate('/hr/leave')}>
            Cancel
          </button>
          <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>
            {saving ? 'Filing...' : 'File Leave'}
          </button>
        </div>
      </form>
    </div>
  );
}
