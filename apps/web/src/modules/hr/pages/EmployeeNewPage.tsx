import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createEmployee, getDepartments, getPositions, HrApiError } from '../api';
import type { Position } from '../types';
import HrSubNav from './HrSubNav';
import './hr.css';

export default function EmployeeNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  const [employeeNumber, setEmployeeNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [tin, setTin] = useState('');
  const [sssGsisNumber, setSssGsisNumber] = useState('');
  const [philhealthNumber, setPhilhealthNumber] = useState('');
  const [pagibigNumber, setPagibigNumber] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [employmentType, setEmploymentType] = useState('permanent');
  const [dateHired, setDateHired] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [salaryGrade, setSalaryGrade] = useState('');
  const [salaryStep, setSalaryStep] = useState('');

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => {});
    getPositions().then(setPositions).catch(() => {});
  }, []);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const result = await createEmployee({
        employeeNumber, firstName, lastName,
        ...(middleName ? { middleName } : {}),
        ...(suffix ? { suffix } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(gender ? { gender } : {}),
        ...(civilStatus ? { civilStatus } : {}),
        ...(address ? { address } : {}),
        ...(contactNumber ? { contactNumber } : {}),
        ...(email ? { email } : {}),
        ...(tin ? { tin } : {}),
        ...(sssGsisNumber ? { sssGsisNumber } : {}),
        ...(philhealthNumber ? { philhealthNumber } : {}),
        ...(pagibigNumber ? { pagibigNumber } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(positionId ? { positionId } : {}),
        employmentType,
        ...(dateHired ? { dateHired } : {}),
        ...(basicSalary ? { basicSalary: Number(basicSalary) } : {}),
        ...(salaryGrade ? { salaryGrade: Number(salaryGrade) } : {}),
        ...(salaryStep ? { salaryStep: Number(salaryStep) } : {}),
      });
      navigate(`/hr/employees/${result.id}`);
    } catch (err) {
      setFormError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hr-page">
      <HrSubNav />
      <h1>New Employee</h1>

      <form className="hr-form" onSubmit={handleSubmit}>
        {formError && <div className="hr-error">{formError}</div>}

        <fieldset className="hr-fieldset">
          <legend>Basic Information</legend>
          <div className="hr-field">
            <label>Employee Number *</label>
            <input required value={employeeNumber} onChange={(ev) => setEmployeeNumber(ev.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px', gap: '12px' }}>
            <div className="hr-field"><label>First Name *</label><input required value={firstName} onChange={(ev) => setFirstName(ev.target.value)} /></div>
            <div className="hr-field"><label>Middle Name</label><input value={middleName} onChange={(ev) => setMiddleName(ev.target.value)} /></div>
            <div className="hr-field"><label>Last Name *</label><input required value={lastName} onChange={(ev) => setLastName(ev.target.value)} /></div>
            <div className="hr-field"><label>Suffix</label><input value={suffix} onChange={(ev) => setSuffix(ev.target.value)} placeholder="Jr., Sr." /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="hr-field"><label>Date of Birth</label><input type="date" value={dateOfBirth} onChange={(ev) => setDateOfBirth(ev.target.value)} /></div>
            <div className="hr-field">
              <label>Gender</label>
              <select value={gender} onChange={(ev) => setGender(ev.target.value)}>
                <option value="">--</option><option value="male">Male</option><option value="female">Female</option>
              </select>
            </div>
            <div className="hr-field">
              <label>Civil Status</label>
              <select value={civilStatus} onChange={(ev) => setCivilStatus(ev.target.value)}>
                <option value="">--</option><option value="single">Single</option><option value="married">Married</option><option value="widowed">Widowed</option><option value="separated">Separated</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
            <div className="hr-field"><label>Address</label><input value={address} onChange={(ev) => setAddress(ev.target.value)} /></div>
            <div className="hr-field"><label>Contact #</label><input value={contactNumber} onChange={(ev) => setContactNumber(ev.target.value)} /></div>
            <div className="hr-field"><label>Email</label><input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} /></div>
          </div>
        </fieldset>

        <fieldset className="hr-fieldset">
          <legend>Government IDs</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div className="hr-field"><label>TIN</label><input value={tin} onChange={(ev) => setTin(ev.target.value)} /></div>
            <div className="hr-field"><label>GSIS #</label><input value={sssGsisNumber} onChange={(ev) => setSssGsisNumber(ev.target.value)} /></div>
            <div className="hr-field"><label>PhilHealth #</label><input value={philhealthNumber} onChange={(ev) => setPhilhealthNumber(ev.target.value)} /></div>
            <div className="hr-field"><label>Pag-IBIG #</label><input value={pagibigNumber} onChange={(ev) => setPagibigNumber(ev.target.value)} /></div>
          </div>
        </fieldset>

        <fieldset className="hr-fieldset">
          <legend>Employment</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="hr-field">
              <label>Department</label>
              <select value={departmentId} onChange={(ev) => setDepartmentId(ev.target.value)}>
                <option value="">-- None --</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="hr-field">
              <label>Position</label>
              <select value={positionId} onChange={(ev) => setPositionId(ev.target.value)}>
                <option value="">-- None --</option>
                {positions.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.title} ({p.code})</option>)}
              </select>
            </div>
            <div className="hr-field">
              <label>Employment Type</label>
              <select value={employmentType} onChange={(ev) => setEmploymentType(ev.target.value)}>
                <option value="permanent">Permanent</option><option value="casual">Casual</option><option value="contractual">Contractual</option>
                <option value="job_order">Job Order</option><option value="co_terminous">Co-terminous</option><option value="elected">Elected</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="hr-field"><label>Date Hired</label><input type="date" value={dateHired} onChange={(ev) => setDateHired(ev.target.value)} /></div>
            <div className="hr-field"><label>Basic Salary</label><input type="number" step="0.01" value={basicSalary} onChange={(ev) => setBasicSalary(ev.target.value)} /></div>
            <div className="hr-field"><label>Salary Grade</label><input type="number" value={salaryGrade} onChange={(ev) => setSalaryGrade(ev.target.value)} /></div>
          </div>
        </fieldset>

        <div className="hr-form-actions">
          <button type="button" className="hr-btn" onClick={() => navigate('/hr')}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>{saving ? 'Creating...' : 'Create Employee'}</button>
        </div>
      </form>
    </div>
  );
}
