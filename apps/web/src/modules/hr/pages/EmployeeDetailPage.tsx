import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getEmployee, updateEmployee, HrApiError, getDepartments, getPositions } from '../api';
import type { Employee, Position } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Employee };

function formatPeso(val: string | number | null) {
  if (val === null) return '--';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>(
    [],
  );
  const [positions, setPositions] = useState<Position[]>([]);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [tin, setTin] = useState('');
  const [sssGsisNumber, setSssGsisNumber] = useState('');
  const [philhealthNumber, setPhilhealthNumber] = useState('');
  const [pagibigNumber, setPagibigNumber] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [dateHired, setDateHired] = useState('');
  const [dateRegularized, setDateRegularized] = useState('');
  const [dateSeparated, setDateSeparated] = useState('');
  const [separationReason, setSeparationReason] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [salaryGrade, setSalaryGrade] = useState('');
  const [salaryStep, setSalaryStep] = useState('');

  async function load() {
    if (!id) return;
    try {
      const data = await getEmployee(id);
      setState({ status: 'loaded', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof HrApiError ? err.message : 'Failed.' });
    }
  }

  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {});
    getPositions()
      .then(setPositions)
      .catch(() => {});
  }, []);

  function startEdit(e: Employee) {
    setFirstName(e.firstName);
    setMiddleName(e.middleName || '');
    setLastName(e.lastName);
    setSuffix(e.suffix || '');
    setAddress(e.address || '');
    setContactNumber(e.contactNumber || '');
    setEmail(e.email || '');
    setGender(e.gender || '');
    setCivilStatus(e.civilStatus || '');
    setDateOfBirth(e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : '');
    setTin(e.tin || '');
    setSssGsisNumber(e.sssGsisNumber || '');
    setPhilhealthNumber(e.philhealthNumber || '');
    setPagibigNumber(e.pagibigNumber || '');
    setDepartmentId(e.departmentId || '');
    setPositionId(e.positionId || '');
    setEmploymentType(e.employmentType);
    setEmploymentStatus(e.employmentStatus);
    setDateHired(e.dateHired ? e.dateHired.slice(0, 10) : '');
    setDateRegularized(e.dateRegularized ? e.dateRegularized.slice(0, 10) : '');
    setDateSeparated(e.dateSeparated ? e.dateSeparated.slice(0, 10) : '');
    setSeparationReason(e.separationReason || '');
    setBasicSalary(e.basicSalary ? String(Number(e.basicSalary)) : '');
    setSalaryGrade(e.salaryGrade !== null ? String(e.salaryGrade) : '');
    setSalaryStep(e.salaryStep !== null ? String(e.salaryStep) : '');
    setFormError('');
    setEditing(true);
  }

  async function handleUpdate(ev: React.FormEvent) {
    ev.preventDefault();
    if (state.status !== 'loaded') return;
    setSaving(true);
    setFormError('');
    try {
      await updateEmployee(state.data.id, {
        expectedVersion: state.data.version,
        firstName,
        lastName,
        middleName,
        suffix,
        address,
        contactNumber,
        email,
        gender,
        civilStatus,
        ...(dateOfBirth ? { dateOfBirth } : {}),
        tin,
        sssGsisNumber,
        philhealthNumber,
        pagibigNumber,
        departmentId,
        positionId,
        employmentType,
        employmentStatus,
        ...(dateHired ? { dateHired } : {}),
        ...(dateRegularized ? { dateRegularized } : {}),
        ...(dateSeparated ? { dateSeparated } : {}),
        separationReason,
        ...(basicSalary ? { basicSalary: Number(basicSalary) } : {}),
        ...(salaryGrade ? { salaryGrade: Number(salaryGrade) } : {}),
        ...(salaryStep ? { salaryStep: Number(salaryStep) } : {}),
      });
      setEditing(false);
      load();
    } catch (err) {
      setFormError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'loading')
    return (
      <div className="hr-page">
        <HrSubNav />
        <p>Loading...</p>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="hr-page">
        <HrSubNav />
        <div className="hr-error">{state.message}</div>
      </div>
    );

  const e = state.data;

  return (
    <div className="hr-page">
      <HrSubNav />
      <Link to="/hr" className="hr-back-link">
        &larr; Back to Employees
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <h1 style={{ margin: '8px 0' }}>
          {e.lastName}, {e.firstName}
          {e.middleName ? ` ${e.middleName}` : ''}
          {e.suffix ? ` ${e.suffix}` : ''}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`hr-badge hr-badge--${e.employmentStatus}`}>
            {e.employmentStatus.replace('_', ' ')}
          </span>
          <span className={`hr-badge hr-badge--${e.employmentType}`}>
            {e.employmentType.replace('_', ' ')}
          </span>
        </div>
      </div>

      {!editing && (
        <>
          <div className="hr-detail-grid">
            <div className="hr-detail-item">
              <span className="hr-detail-label">Employee #</span>
              <span className="hr-detail-value hr-text-mono">{e.employeeNumber}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Position</span>
              <span className="hr-detail-value">{e.position?.title ?? '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Department</span>
              <span className="hr-detail-value">{e.department?.name ?? '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Basic Salary</span>
              <span className="hr-detail-value hr-text-mono">{formatPeso(e.basicSalary)}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Salary Grade / Step</span>
              <span className="hr-detail-value">
                {e.salaryGrade !== null ? `SG ${e.salaryGrade} Step ${e.salaryStep ?? 1}` : '--'}
              </span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Linked User</span>
              <span className="hr-detail-value">{e.user?.username ?? '--'}</span>
            </div>
          </div>

          <h3 className="hr-section-title">Personal Information</h3>
          <div className="hr-detail-grid">
            <div className="hr-detail-item">
              <span className="hr-detail-label">Date of Birth</span>
              <span className="hr-detail-value">
                {e.dateOfBirth ? new Date(e.dateOfBirth).toLocaleDateString() : '--'}
              </span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Gender</span>
              <span className="hr-detail-value" style={{ textTransform: 'capitalize' }}>
                {e.gender || '--'}
              </span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Civil Status</span>
              <span className="hr-detail-value" style={{ textTransform: 'capitalize' }}>
                {e.civilStatus || '--'}
              </span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Address</span>
              <span className="hr-detail-value">{e.address || '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Contact</span>
              <span className="hr-detail-value">{e.contactNumber || '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Email</span>
              <span className="hr-detail-value">{e.email || '--'}</span>
            </div>
          </div>

          <h3 className="hr-section-title">Government IDs</h3>
          <div className="hr-detail-grid">
            <div className="hr-detail-item">
              <span className="hr-detail-label">TIN</span>
              <span className="hr-detail-value hr-text-mono">{e.tin || '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">GSIS #</span>
              <span className="hr-detail-value hr-text-mono">{e.sssGsisNumber || '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">PhilHealth #</span>
              <span className="hr-detail-value hr-text-mono">{e.philhealthNumber || '--'}</span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Pag-IBIG #</span>
              <span className="hr-detail-value hr-text-mono">{e.pagibigNumber || '--'}</span>
            </div>
          </div>

          <h3 className="hr-section-title">Employment History</h3>
          <div className="hr-detail-grid">
            <div className="hr-detail-item">
              <span className="hr-detail-label">Date Hired</span>
              <span className="hr-detail-value">
                {e.dateHired ? new Date(e.dateHired).toLocaleDateString() : '--'}
              </span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Date Regularized</span>
              <span className="hr-detail-value">
                {e.dateRegularized ? new Date(e.dateRegularized).toLocaleDateString() : '--'}
              </span>
            </div>
            <div className="hr-detail-item">
              <span className="hr-detail-label">Date Separated</span>
              <span className="hr-detail-value">
                {e.dateSeparated ? new Date(e.dateSeparated).toLocaleDateString() : '--'}
              </span>
            </div>
            {e.separationReason && (
              <div className="hr-detail-item">
                <span className="hr-detail-label">Separation Reason</span>
                <span className="hr-detail-value">{e.separationReason}</span>
              </div>
            )}
          </div>

          {hasPermission('hr.employee.manage') && (
            <button type="button" className="hr-btn hr-btn--primary" onClick={() => startEdit(e)}>
              Edit Employee
            </button>
          )}

          <div style={{ marginTop: '24px', fontSize: '12px', color: '#98a2b3' }}>
            Created: {new Date(e.createdAt).toLocaleString()}
            {e.creator && <> by {e.creator.username}</>}
            {' | '}Updated: {new Date(e.updatedAt).toLocaleString()}
            {e.updater && <> by {e.updater.username}</>}
          </div>
        </>
      )}

      {editing && (
        <form className="hr-form" onSubmit={handleUpdate}>
          {formError && <div className="hr-error">{formError}</div>}

          <fieldset className="hr-fieldset">
            <legend>Personal Information</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px', gap: '12px' }}>
              <div className="hr-field">
                <label>First Name *</label>
                <input
                  required
                  value={firstName}
                  onChange={(ev) => setFirstName(ev.target.value)}
                />
              </div>
              <div className="hr-field">
                <label>Middle Name</label>
                <input value={middleName} onChange={(ev) => setMiddleName(ev.target.value)} />
              </div>
              <div className="hr-field">
                <label>Last Name *</label>
                <input required value={lastName} onChange={(ev) => setLastName(ev.target.value)} />
              </div>
              <div className="hr-field">
                <label>Suffix</label>
                <input
                  value={suffix}
                  onChange={(ev) => setSuffix(ev.target.value)}
                  placeholder="Jr., Sr."
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="hr-field">
                <label>Date of Birth</label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(ev) => setDateOfBirth(ev.target.value)}
                />
              </div>
              <div className="hr-field">
                <label>Gender</label>
                <select value={gender} onChange={(ev) => setGender(ev.target.value)}>
                  <option value="">--</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="hr-field">
                <label>Civil Status</label>
                <select value={civilStatus} onChange={(ev) => setCivilStatus(ev.target.value)}>
                  <option value="">--</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div className="hr-field">
                <label>Address</label>
                <input value={address} onChange={(ev) => setAddress(ev.target.value)} />
              </div>
              <div className="hr-field">
                <label>Contact #</label>
                <input value={contactNumber} onChange={(ev) => setContactNumber(ev.target.value)} />
              </div>
              <div className="hr-field">
                <label>Email</label>
                <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="hr-fieldset">
            <legend>Government IDs</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div className="hr-field">
                <label>TIN</label>
                <input value={tin} onChange={(ev) => setTin(ev.target.value)} />
              </div>
              <div className="hr-field">
                <label>GSIS #</label>
                <input value={sssGsisNumber} onChange={(ev) => setSssGsisNumber(ev.target.value)} />
              </div>
              <div className="hr-field">
                <label>PhilHealth #</label>
                <input
                  value={philhealthNumber}
                  onChange={(ev) => setPhilhealthNumber(ev.target.value)}
                />
              </div>
              <div className="hr-field">
                <label>Pag-IBIG #</label>
                <input value={pagibigNumber} onChange={(ev) => setPagibigNumber(ev.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="hr-fieldset">
            <legend>Employment</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="hr-field">
                <label>Department</label>
                <select
                  value={departmentId}
                  onChange={(ev) => setDepartmentId(ev.target.value)}
                  style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
                >
                  <option value="">-- None --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hr-field">
                <label>Position</label>
                <select
                  value={positionId}
                  onChange={(ev) => setPositionId(ev.target.value)}
                  style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
                >
                  <option value="">-- None --</option>
                  {positions
                    .filter((p) => p.isActive)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.code})
                      </option>
                    ))}
                </select>
              </div>
              <div className="hr-field">
                <label>Employment Type</label>
                <select
                  value={employmentType}
                  onChange={(ev) => setEmploymentType(ev.target.value)}
                >
                  <option value="permanent">Permanent</option>
                  <option value="casual">Casual</option>
                  <option value="contractual">Contractual</option>
                  <option value="job_order">Job Order</option>
                  <option value="co_terminous">Co-terminous</option>
                  <option value="elected">Elected</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="hr-field">
                <label>Status</label>
                <select
                  value={employmentStatus}
                  onChange={(ev) => setEmploymentStatus(ev.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="resigned">Resigned</option>
                  <option value="retired">Retired</option>
                  <option value="terminated">Terminated</option>
                  <option value="on_leave">On Leave</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="hr-field">
                <label>Date Hired</label>
                <input
                  type="date"
                  value={dateHired}
                  onChange={(ev) => setDateHired(ev.target.value)}
                />
              </div>
              <div className="hr-field">
                <label>Date Regularized</label>
                <input
                  type="date"
                  value={dateRegularized}
                  onChange={(ev) => setDateRegularized(ev.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="hr-field">
                <label>Basic Salary</label>
                <input
                  type="number"
                  step="0.01"
                  value={basicSalary}
                  onChange={(ev) => setBasicSalary(ev.target.value)}
                />
              </div>
              <div className="hr-field">
                <label>Salary Grade</label>
                <input
                  type="number"
                  value={salaryGrade}
                  onChange={(ev) => setSalaryGrade(ev.target.value)}
                />
              </div>
              <div className="hr-field">
                <label>Salary Step</label>
                <input
                  type="number"
                  value={salaryStep}
                  onChange={(ev) => setSalaryStep(ev.target.value)}
                />
              </div>
            </div>
            {(employmentStatus === 'resigned' ||
              employmentStatus === 'retired' ||
              employmentStatus === 'terminated') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div className="hr-field">
                  <label>Date Separated</label>
                  <input
                    type="date"
                    value={dateSeparated}
                    onChange={(ev) => setDateSeparated(ev.target.value)}
                  />
                </div>
                <div className="hr-field">
                  <label>Separation Reason</label>
                  <input
                    value={separationReason}
                    onChange={(ev) => setSeparationReason(ev.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>

          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Update Employee'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
