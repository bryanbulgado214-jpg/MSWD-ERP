import { useEffect, useState, type JSX } from 'react';

import { useAuth } from '../../../app/auth';
import {
  getPayrollPeriods,
  createPayrollPeriod,
  lockPayrollPeriod,
  getPayrollRuns,
  createPayrollRun,
  getPayrollRun,
  computePayroll,
  approvePayroll,
  payPayroll,
  voidPayroll,
  HrApiError,
} from '../api';
import type { PayrollPeriod, PayrollRun, PayrollStatus } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

type View = 'periods' | 'runs' | 'detail';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function fmtDate(d: string | null) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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

export default function PayrollPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.payroll.manage');
  const canApprove = hasPermission('hr.payroll.approve');

  const [view, setView] = useState<View>('runs');
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Period form
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [pName, setPName] = useState('');
  const [pType, setPType] = useState('semi_monthly');
  const [pStart, setPStart] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [pPayDate, setPPayDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Run form
  const [showRunForm, setShowRunForm] = useState(false);
  const [rPeriodId, setRPeriodId] = useState('');
  const [rRemarks, setRRemarks] = useState('');

  // Void modal
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidRunId, setVoidRunId] = useState('');
  const [voidVersion, setVoidVersion] = useState(0);
  const [voidReason, setVoidReason] = useState('');

  // Filter
  const [filterPeriodId, setFilterPeriodId] = useState('');

  function loadPeriods() {
    setLoading(true);
    getPayrollPeriods()
      .then(setPeriods)
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.'))
      .finally(() => setLoading(false));
  }

  function loadRuns() {
    setLoading(true);
    const params = filterPeriodId ? `payrollPeriodId=${filterPeriodId}` : undefined;
    getPayrollRuns(params)
      .then(setRuns)
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.'))
      .finally(() => setLoading(false));
  }

  function loadRunDetail(id: string) {
    setLoading(true);
    getPayrollRun(id)
      .then((r) => {
        setSelectedRun(r);
        setView('detail');
      })
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (view === 'periods') loadPeriods();
    else if (view === 'runs') loadRuns();
  }, [view, filterPeriodId]);

  async function handleCreatePeriod(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      await createPayrollPeriod({
        name: pName,
        periodType: pType,
        startDate: pStart,
        endDate: pEnd,
        payDate: pPayDate,
      });
      setShowPeriodForm(false);
      loadPeriods();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLock(period: PayrollPeriod) {
    setActionError('');
    try {
      await lockPayrollPeriod(period.id, period.version);
      loadPeriods();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    }
  }

  async function handleCreateRun(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      await createPayrollRun({
        payrollPeriodId: rPeriodId,
        ...(rRemarks ? { remarks: rRemarks } : {}),
      });
      setShowRunForm(false);
      loadRuns();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCompute(run: PayrollRun) {
    if (!confirm('Compute payroll for all active employees? This may take a moment.')) return;
    setActionError('');
    try {
      await computePayroll(run.id, run.version);
      if (view === 'detail') loadRunDetail(run.id);
      else loadRuns();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    }
  }

  async function handleApprove(run: PayrollRun) {
    if (!confirm('Approve this payroll run?')) return;
    setActionError('');
    try {
      await approvePayroll(run.id, run.version);
      if (view === 'detail') loadRunDetail(run.id);
      else loadRuns();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    }
  }

  async function handlePay(run: PayrollRun) {
    if (!confirm('Mark this payroll as paid? This is final.')) return;
    setActionError('');
    try {
      await payPayroll(run.id, run.version);
      if (view === 'detail') loadRunDetail(run.id);
      else loadRuns();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    }
  }

  async function handleVoid() {
    if (!voidReason.trim()) return;
    setSaving(true);
    setActionError('');
    try {
      await voidPayroll(voidRunId, voidVersion, voidReason);
      setShowVoidModal(false);
      if (view === 'detail') loadRunDetail(voidRunId);
      else loadRuns();
    } catch (e) {
      setActionError(e instanceof HrApiError ? e.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  function openVoidModal(run: PayrollRun) {
    setVoidRunId(run.id);
    setVoidVersion(run.version);
    setVoidReason('');
    setShowVoidModal(true);
  }

  function renderActions(run: PayrollRun) {
    const btns: JSX.Element[] = [];
    if (canManage && (run.status === 'draft' || run.status === 'computed')) {
      btns.push(
        <button
          key="compute"
          type="button"
          className="hr-btn hr-btn--primary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={() => handleCompute(run)}
        >
          {run.status === 'computed' ? 'Re-compute' : 'Compute'}
        </button>,
      );
    }
    if (canApprove && run.status === 'computed') {
      btns.push(
        <button
          key="approve"
          type="button"
          className="hr-btn hr-btn--primary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={() => handleApprove(run)}
        >
          Approve
        </button>,
      );
    }
    if (canManage && run.status === 'approved') {
      btns.push(
        <button
          key="pay"
          type="button"
          className="hr-btn hr-btn--primary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={() => handlePay(run)}
        >
          Mark Paid
        </button>,
      );
    }
    if (canManage && run.status !== 'voided' && run.status !== 'paid') {
      btns.push(
        <button
          key="void"
          type="button"
          className="hr-btn hr-btn--danger"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={() => openVoidModal(run)}
        >
          Void
        </button>,
      );
    }
    return <>{btns}</>;
  }

  // ── Detail View ──
  if (view === 'detail' && selectedRun) {
    return (
      <div className="hr-page">
        <HrSubNav />
        <div className="hr-toolbar">
          <button
            type="button"
            className="hr-btn"
            onClick={() => {
              setView('runs');
              setSelectedRun(null);
            }}
          >
            &larr; Back to Runs
          </button>
          <div style={{ display: 'flex', gap: 8 }}>{renderActions(selectedRun)}</div>
        </div>
        {actionError && <div className="hr-error">{actionError}</div>}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}
        >
          <div className="hr-form" style={{ padding: 12 }}>
            <strong>{selectedRun.runNumber}</strong>
            <div>Period: {selectedRun.payrollPeriod.name}</div>
            <div>
              Dates: {fmtDate(selectedRun.payrollPeriod.startDate)} –{' '}
              {fmtDate(selectedRun.payrollPeriod.endDate)}
            </div>
            <div>Pay Date: {fmtDate(selectedRun.payrollPeriod.payDate)}</div>
            <div>
              Status:{' '}
              <span className={`hr-badge hr-badge--${STATUS_COLORS[selectedRun.status]}`}>
                {selectedRun.status}
              </span>
            </div>
          </div>
          <div className="hr-form" style={{ padding: 12 }}>
            <div>
              Employees: <strong>{selectedRun.employeeCount}</strong>
            </div>
            <div>
              Total Gross: <strong>{formatPeso(selectedRun.totalGross)}</strong>
            </div>
            <div>
              Total Deductions: <strong>{formatPeso(selectedRun.totalDeductions)}</strong>
            </div>
            <div>
              Total Net:{' '}
              <strong style={{ color: 'var(--color-success, #16a34a)' }}>
                {formatPeso(selectedRun.totalNet)}
              </strong>
            </div>
          </div>
          <div className="hr-form" style={{ padding: 12 }}>
            <div>
              Created: {fmtDate(selectedRun.createdAt)} by {selectedRun.creator?.username ?? '--'}
            </div>
            {selectedRun.computedAt && <div>Computed: {fmtDate(selectedRun.computedAt)}</div>}
            {selectedRun.approvedAt && (
              <div>
                Approved: {fmtDate(selectedRun.approvedAt)} by{' '}
                {selectedRun.approver?.username ?? '--'}
              </div>
            )}
            {selectedRun.paidAt && <div>Paid: {fmtDate(selectedRun.paidAt)}</div>}
            {selectedRun.voidReason && (
              <div style={{ color: '#dc2626' }}>Voided: {selectedRun.voidReason}</div>
            )}
            {selectedRun.remarks && <div>Remarks: {selectedRun.remarks}</div>}
          </div>
        </div>

        {selectedRun.items && selectedRun.items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th style={{ textAlign: 'right' }}>Basic Pay</th>
                  <th style={{ textAlign: 'right' }}>Allowances</th>
                  <th style={{ textAlign: 'right' }}>OT Pay</th>
                  <th style={{ textAlign: 'right' }}>Gross</th>
                  <th style={{ textAlign: 'right' }}>Deductions</th>
                  <th style={{ textAlign: 'right' }}>Net Pay</th>
                  <th style={{ textAlign: 'center' }}>Days</th>
                  <th style={{ textAlign: 'center' }}>Late</th>
                </tr>
              </thead>
              <tbody>
                {selectedRun.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="hr-text-mono">{item.employee.employeeNumber}</span>{' '}
                      {item.employee.lastName}, {item.employee.firstName}
                    </td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                      {formatPeso(item.basicPay)}
                    </td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                      {formatPeso(item.totalAllowances)}
                    </td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                      {formatPeso(item.overtimePay)}
                    </td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                      {formatPeso(item.grossPay)}
                    </td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                      {formatPeso(item.totalDeductions)}
                    </td>
                    <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatPeso(item.netPay)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(item.daysWorked)}/{Number(item.daysAbsent)}a
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(item.hoursLate) > 0 ? `${Number(item.hoursLate)}h` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>TOTAL ({selectedRun.employeeCount} employees)</td>
                  <td style={{ textAlign: 'right' }}></td>
                  <td style={{ textAlign: 'right' }}></td>
                  <td style={{ textAlign: 'right' }}></td>
                  <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                    {formatPeso(selectedRun.totalGross)}
                  </td>
                  <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                    {formatPeso(selectedRun.totalDeductions)}
                  </td>
                  <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                    {formatPeso(selectedRun.totalNet)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {selectedRun.items && selectedRun.items.length === 0 && selectedRun.status === 'draft' && (
          <div className="hr-empty">
            No items yet. Click &quot;Compute&quot; to generate payroll for all active employees.
          </div>
        )}

        {/* Void modal */}
        {showVoidModal && (
          <div className="hr-modal-overlay" onClick={() => setShowVoidModal(false)}>
            <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Void Payroll Run</h3>
              <div className="hr-field">
                <label>Reason *</label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  required
                />
              </div>
              <div className="hr-form-actions">
                <button type="button" className="hr-btn" onClick={() => setShowVoidModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="hr-btn hr-btn--danger"
                  disabled={saving || !voidReason.trim()}
                  onClick={handleVoid}
                >
                  {saving ? 'Voiding...' : 'Void Run'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List Views ──
  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <div className="hr-toolbar__filters">
          <button
            type="button"
            className={`hr-btn${view === 'runs' ? ' hr-btn--primary' : ''}`}
            onClick={() => setView('runs')}
          >
            Payroll Runs
          </button>
          <button
            type="button"
            className={`hr-btn${view === 'periods' ? ' hr-btn--primary' : ''}`}
            onClick={() => setView('periods')}
          >
            Pay Periods
          </button>
        </div>
        {canManage && view === 'periods' && (
          <button
            type="button"
            className="hr-btn hr-btn--primary"
            onClick={() => {
              setPName('');
              setPType('semi_monthly');
              setPStart('');
              setPEnd('');
              setPPayDate('');
              setActionError('');
              setShowPeriodForm(true);
            }}
          >
            + New Period
          </button>
        )}
        {canManage && view === 'runs' && (
          <button
            type="button"
            className="hr-btn hr-btn--primary"
            onClick={() => {
              setRPeriodId(periods[0]?.id ?? '');
              setRRemarks('');
              setActionError('');
              loadPeriods();
              setShowRunForm(true);
            }}
          >
            + New Run
          </button>
        )}
      </div>

      {error && <div className="hr-error">{error}</div>}
      {actionError && <div className="hr-error">{actionError}</div>}

      {/* Period form */}
      {showPeriodForm && (
        <form className="hr-form" onSubmit={handleCreatePeriod} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px 140px 140px 140px',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div className="hr-field">
              <label>Name *</label>
              <input
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. July 2026 1st Half"
              />
            </div>
            <div className="hr-field">
              <label>Type</label>
              <select value={pType} onChange={(e) => setPType(e.target.value)}>
                <option value="semi_monthly">Semi-Monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="hr-field">
              <label>Start Date *</label>
              <input
                type="date"
                required
                value={pStart}
                onChange={(e) => setPStart(e.target.value)}
              />
            </div>
            <div className="hr-field">
              <label>End Date *</label>
              <input type="date" required value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
            </div>
            <div className="hr-field">
              <label>Pay Date *</label>
              <input
                type="date"
                required
                value={pPayDate}
                onChange={(e) => setPPayDate(e.target.value)}
              />
            </div>
          </div>
          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setShowPeriodForm(false)}>
              Cancel
            </button>
            <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Period'}
            </button>
          </div>
        </form>
      )}

      {/* Run form */}
      {showRunForm && (
        <form className="hr-form" onSubmit={handleCreateRun} style={{ marginBottom: 16 }}>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}
          >
            <div className="hr-field">
              <label>Pay Period *</label>
              <select
                required
                value={rPeriodId}
                onChange={(e) => setRPeriodId(e.target.value)}
                style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
              >
                <option value="">Select period...</option>
                {periods
                  .filter((p) => !p.isLocked)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({fmtDate(p.startDate)} – {fmtDate(p.endDate)})
                    </option>
                  ))}
              </select>
            </div>
            <div className="hr-field">
              <label>Remarks</label>
              <input value={rRemarks} onChange={(e) => setRRemarks(e.target.value)} />
            </div>
          </div>
          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setShowRunForm(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="hr-btn hr-btn--primary"
              disabled={saving || !rPeriodId}
            >
              {saving ? 'Saving...' : 'Create Run'}
            </button>
          </div>
        </form>
      )}

      {loading && <p>Loading...</p>}

      {/* Periods table */}
      {view === 'periods' && !loading && (
        <>
          {periods.length === 0 && <div className="hr-empty">No pay periods configured.</div>}
          {periods.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Pay Date</th>
                    <th>Runs</th>
                    <th>Status</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.periodType.replace('_', '-')}</td>
                      <td>{fmtDate(p.startDate)}</td>
                      <td>{fmtDate(p.endDate)}</td>
                      <td>{fmtDate(p.payDate)}</td>
                      <td style={{ textAlign: 'center' }}>{p._count.payrollRuns}</td>
                      <td>
                        <span
                          className={`hr-badge hr-badge--${p.isLocked ? 'resigned' : 'active'}`}
                        >
                          {p.isLocked ? 'Locked' : 'Open'}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <button
                            type="button"
                            className="hr-btn"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            onClick={() => handleLock(p)}
                          >
                            {p.isLocked ? 'Unlock' : 'Lock'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Runs table */}
      {view === 'runs' && !loading && (
        <>
          <div style={{ marginBottom: 12 }}>
            <select
              value={filterPeriodId}
              onChange={(e) => setFilterPeriodId(e.target.value)}
              style={{ padding: '4px 8px', width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
            >
              <option value="">All Periods</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {runs.length === 0 && <div className="hr-empty">No payroll runs yet.</div>}
          {runs.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Run #</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Employees</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Deductions</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          type="button"
                          className="hr-btn"
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            textDecoration: 'underline',
                          }}
                          onClick={() => loadRunDetail(r.id)}
                        >
                          {r.runNumber}
                        </button>
                      </td>
                      <td>{r.payrollPeriod.name}</td>
                      <td>
                        <span className={`hr-badge hr-badge--${STATUS_COLORS[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{r.employeeCount}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                        {formatPeso(r.totalGross)}
                      </td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>
                        {formatPeso(r.totalDeductions)}
                      </td>
                      <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPeso(r.totalNet)}
                      </td>
                      <td>{fmtDate(r.createdAt)}</td>
                      <td style={{ display: 'flex', gap: 4 }}>{renderActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Void modal */}
      {showVoidModal && (
        <div className="hr-modal-overlay" onClick={() => setShowVoidModal(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Void Payroll Run</h3>
            <div className="hr-field">
              <label>Reason *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                required
              />
            </div>
            <div className="hr-form-actions">
              <button type="button" className="hr-btn" onClick={() => setShowVoidModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="hr-btn hr-btn--danger"
                disabled={saving || !voidReason.trim()}
                onClick={handleVoid}
              >
                {saving ? 'Voiding...' : 'Void Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
