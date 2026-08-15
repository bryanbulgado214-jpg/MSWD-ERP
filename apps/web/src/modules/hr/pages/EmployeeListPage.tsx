import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getEmployees, getDepartments, HrApiError } from '../api';
import type { Employee } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Employee[] };

function formatPeso(val: string | number | null) {
  if (val === null) return '--';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function EmployeeListPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>(
    [],
  );

  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const deptFilter = searchParams.get('departmentId') || '';
  const typeFilter = searchParams.get('employmentType') || '';

  function load() {
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (deptFilter) params.set('departmentId', deptFilter);
    if (typeFilter) params.set('employmentType', typeFilter);
    getEmployees(params.toString() || undefined)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof HrApiError ? err.message : 'Failed.' }),
      );
  }

  useEffect(() => {
    load();
  }, [search, statusFilter, deptFilter, typeFilter]);
  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {});
  }, []);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <div className="hr-toolbar__filters">
          <input
            type="text"
            placeholder="Search name or employee #..."
            value={search}
            onChange={(e) => setFilter('search', e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
            <option value="retired">Retired</option>
            <option value="terminated">Terminated</option>
            <option value="on_leave">On Leave</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={typeFilter} onChange={(e) => setFilter('employmentType', e.target.value)}>
            <option value="">All Types</option>
            <option value="permanent">Permanent</option>
            <option value="casual">Casual</option>
            <option value="contractual">Contractual</option>
            <option value="job_order">Job Order</option>
            <option value="co_terminous">Co-terminous</option>
            <option value="elected">Elected</option>
          </select>
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setFilter('departmentId', e.target.value)}
              style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {hasPermission('hr.employee.manage') && (
          <Link to="/hr/employees/new" className="hr-btn hr-btn--primary">
            + New Employee
          </Link>
        )}
      </div>

      {state.status === 'loading' && <p>Loading...</p>}
      {state.status === 'error' && <div className="hr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="hr-empty">No employees found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="hr-table">
            <thead>
              <tr>
                <th>Emp #</th>
                <th>Name</th>
                <th>Position</th>
                <th>Department</th>
                <th>Type</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Basic Salary</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((e) => (
                <tr key={e.id}>
                  <td className="hr-text-mono">
                    <Link to={`/hr/employees/${e.id}`} className="hr-table__link">
                      {e.employeeNumber}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/hr/employees/${e.id}`} className="hr-table__link">
                      {e.lastName}, {e.firstName}
                      {e.middleName ? ` ${e.middleName.charAt(0)}.` : ''}
                      {e.suffix ? ` ${e.suffix}` : ''}
                    </Link>
                  </td>
                  <td>{e.position?.title ?? '--'}</td>
                  <td>{e.department?.name ?? '--'}</td>
                  <td>
                    <span className={`hr-badge hr-badge--${e.employmentType}`}>
                      {e.employmentType.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`hr-badge hr-badge--${e.employmentStatus}`}>
                      {e.employmentStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                    {formatPeso(e.basicSalary)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
