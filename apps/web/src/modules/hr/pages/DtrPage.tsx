import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../app/auth';
import { getDtrRecords, getDtrUploads, getEmployees, uploadDtrExcel, HrApiError } from '../api';
import type { DtrRecord, DtrUpload, Employee } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

type Tab = 'records' | 'uploads';

function formatTime(val: string | null): string {
  if (!val) return '--';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function DtrPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>('records');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const [records, setRecords] = useState<DtrRecord[]>([]);
  const [uploads, setUploads] = useState<DtrUpload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<DtrUpload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getEmployees()
      .then(setEmployees)
      .catch(() => {});
  }, []);

  function loadRecords() {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (employeeFilter) params.set('employeeId', employeeFilter);
    params.set('month', String(month));
    params.set('year', String(year));
    getDtrRecords(params.toString())
      .then(setRecords)
      .catch((err) => setError(err instanceof HrApiError ? err.message : 'Failed.'))
      .finally(() => setLoading(false));
  }

  function loadUploads() {
    setLoading(true);
    setError('');
    getDtrUploads()
      .then(setUploads)
      .catch((err) => setError(err instanceof HrApiError ? err.message : 'Failed.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (tab === 'records') loadRecords();
    else loadUploads();
  }, [tab, employeeFilter, month, year]);

  async function handleUpload(ev: React.FormEvent) {
    ev.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError('');
    setUploadResult(null);
    try {
      const result = await uploadDtrExcel(uploadFile, periodStart, periodEnd);
      setUploadResult(result);
      setUploadFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadRecords();
      loadUploads();
    } catch (err) {
      setError(err instanceof HrApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
  }));

  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <div className="hr-toolbar__filters">
          <button
            type="button"
            className={`hr-btn${tab === 'records' ? ' hr-btn--primary' : ''}`}
            onClick={() => setTab('records')}
          >
            DTR Records
          </button>
          <button
            type="button"
            className={`hr-btn${tab === 'uploads' ? ' hr-btn--primary' : ''}`}
            onClick={() => setTab('uploads')}
          >
            Upload History
          </button>
        </div>
        {hasPermission('hr.attendance.manage') && (
          <button
            type="button"
            className="hr-btn hr-btn--primary"
            onClick={() => setShowUpload(!showUpload)}
          >
            {showUpload ? 'Hide Upload' : 'Upload DTR Excel'}
          </button>
        )}
      </div>

      {error && <div className="hr-error">{error}</div>}

      {showUpload && (
        <form
          className="hr-form"
          onSubmit={handleUpload}
          style={{
            marginBottom: 16,
            padding: 16,
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: 8,
          }}
        >
          <h3 style={{ margin: '0 0 12px' }}>Upload DTR from Excel</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #666)', margin: '0 0 12px' }}>
            Upload an Excel file (.xlsx, .xls) with columns: Employee Number/ID, Date, AM In, AM
            Out, PM In, PM Out, Remarks. Column headers are matched flexibly (e.g. "Emp No",
            "Employee Number", "emp_no" all work).
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 160px',
              gap: '12px',
              alignItems: 'end',
            }}
          >
            <div className="hr-field">
              <label>Excel File *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(ev) => setUploadFile(ev.target.files?.[0] ?? null)}
              />
            </div>
            <div className="hr-field">
              <label>Period Start *</label>
              <input
                type="date"
                required
                value={periodStart}
                onChange={(ev) => setPeriodStart(ev.target.value)}
              />
            </div>
            <div className="hr-field">
              <label>Period End *</label>
              <input
                type="date"
                required
                value={periodEnd}
                onChange={(ev) => setPeriodEnd(ev.target.value)}
              />
            </div>
          </div>
          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setShowUpload(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="hr-btn hr-btn--primary"
              disabled={uploading || !uploadFile}
            >
              {uploading ? 'Processing...' : 'Upload & Process'}
            </button>
          </div>
          {uploadResult && (
            <div
              className="hr-info-box"
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--bg-info, #f0f4ff)',
                borderRadius: 6,
              }}
            >
              <strong>Upload Complete:</strong> {uploadResult.processedRecords} records processed,{' '}
              {uploadResult.errorRecords} errors
              {uploadResult.errorLog && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: '13px' }}>View Errors</summary>
                  <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', marginTop: 4 }}>
                    {uploadResult.errorLog}
                  </pre>
                </details>
              )}
            </div>
          )}
        </form>
      )}

      {tab === 'records' && (
        <>
          <div className="hr-toolbar" style={{ marginBottom: 12 }}>
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
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
          </div>

          {loading && <p>Loading...</p>}
          {!loading && records.length === 0 && (
            <div className="hr-empty">No DTR records found for this period.</div>
          )}
          {!loading && records.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>AM In</th>
                    <th>AM Out</th>
                    <th>PM In</th>
                    <th>PM Out</th>
                    <th style={{ textAlign: 'right' }}>Hours</th>
                    <th style={{ textAlign: 'right' }}>Late</th>
                    <th style={{ textAlign: 'right' }}>UT</th>
                    <th>Flags</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        r.isAbsent
                          ? 'hr-row--absent'
                          : r.isHoliday
                            ? 'hr-row--holiday'
                            : r.isRestDay
                              ? 'hr-row--rest'
                              : ''
                      }
                    >
                      <td className="hr-text-mono">
                        {new Date(r.recordDate).toLocaleDateString()}
                      </td>
                      <td>
                        {r.employee.lastName}, {r.employee.firstName}
                      </td>
                      <td className="hr-text-mono">{formatTime(r.timeInAm)}</td>
                      <td className="hr-text-mono">{formatTime(r.timeOutAm)}</td>
                      <td className="hr-text-mono">{formatTime(r.timeInPm)}</td>
                      <td className="hr-text-mono">{formatTime(r.timeOutPm)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                        {Number(r.hoursWorked).toFixed(2)}
                      </td>
                      <td
                        className="hr-text-mono"
                        style={{
                          textAlign: 'right',
                          color:
                            Number(r.hoursLate) > 0 ? 'var(--color-danger, #d32f2f)' : 'inherit',
                        }}
                      >
                        {Number(r.hoursLate) > 0 ? Number(r.hoursLate).toFixed(2) : '--'}
                      </td>
                      <td
                        className="hr-text-mono"
                        style={{
                          textAlign: 'right',
                          color:
                            Number(r.hoursUndertime) > 0
                              ? 'var(--color-danger, #d32f2f)'
                              : 'inherit',
                        }}
                      >
                        {Number(r.hoursUndertime) > 0 ? Number(r.hoursUndertime).toFixed(2) : '--'}
                      </td>
                      <td>
                        {r.isAbsent && (
                          <span
                            className="hr-badge hr-badge--terminated"
                            style={{ marginRight: 4 }}
                          >
                            Absent
                          </span>
                        )}
                        {r.isHoliday && (
                          <span className="hr-badge hr-badge--on_leave" style={{ marginRight: 4 }}>
                            Holiday
                          </span>
                        )}
                        {r.isRestDay && (
                          <span className="hr-badge hr-badge--resigned">Rest Day</span>
                        )}
                      </td>
                      <td
                        style={{
                          maxWidth: 150,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.remarks ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'uploads' && (
        <>
          {loading && <p>Loading...</p>}
          {!loading && uploads.length === 0 && <div className="hr-empty">No DTR uploads yet.</div>}
          {!loading && uploads.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Period</th>
                    <th>Records</th>
                    <th>Processed</th>
                    <th>Errors</th>
                    <th>Status</th>
                    <th>Uploaded By</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.id}>
                      <td>{u.fileName}</td>
                      <td className="hr-text-mono">
                        {new Date(u.periodStart).toLocaleDateString()} –{' '}
                        {new Date(u.periodEnd).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>{u.totalRecords}</td>
                      <td style={{ textAlign: 'right' }}>{u.processedRecords}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: u.errorRecords > 0 ? 'var(--color-danger, #d32f2f)' : 'inherit',
                        }}
                      >
                        {u.errorRecords}
                      </td>
                      <td>
                        <span
                          className={`hr-badge hr-badge--${u.status === 'processed' ? 'active' : u.status === 'error' ? 'terminated' : 'on_leave'}`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td>{u.uploader?.username ?? '--'}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
