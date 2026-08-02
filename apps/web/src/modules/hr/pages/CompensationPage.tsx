import { useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  getAllowanceTypes, createAllowanceType, updateAllowanceType,
  getDeductionTypes, createDeductionType, updateDeductionType,
  HrApiError,
} from '../api';
import type { AllowanceType, DeductionType } from '../types';
import HrSubNav from './HrSubNav';
import './hr.css';

type Tab = 'allowances' | 'deductions';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function CompensationPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hr.salary.manage');
  const [tab, setTab] = useState<Tab>('allowances');
  const [allowTypes, setAllowTypes] = useState<AllowanceType[]>([]);
  const [dedTypes, setDedTypes] = useState<DeductionType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Allowance form
  const [showAllowForm, setShowAllowForm] = useState(false);
  const [editingAllowId, setEditingAllowId] = useState<string | null>(null);
  const [aCode, setACode] = useState('');
  const [aName, setAName] = useState('');
  const [aDefault, setADefault] = useState('');
  const [aTaxable, setATaxable] = useState(false);
  const [aFixed, setAFixed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Deduction form
  const [showDedForm, setShowDedForm] = useState(false);
  const [editingDedId, setEditingDedId] = useState<string | null>(null);
  const [dCode, setDCode] = useState('');
  const [dName, setDName] = useState('');
  const [dCategory, setDCategory] = useState('mandatory');
  const [dIsPct, setDIsPct] = useState(false);
  const [dErShare, setDErShare] = useState('');
  const [dEeShare, setDEeShare] = useState('');

  function loadAllow() {
    setLoading(true);
    getAllowanceTypes().then(setAllowTypes).catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.')).finally(() => setLoading(false));
  }
  function loadDed() {
    setLoading(true);
    getDeductionTypes().then(setDedTypes).catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.')).finally(() => setLoading(false));
  }

  useEffect(() => { if (tab === 'allowances') loadAllow(); else loadDed(); }, [tab]);

  function startNewAllow() {
    setEditingAllowId(null); setACode(''); setAName(''); setADefault(''); setATaxable(false); setAFixed(true); setFormError(''); setShowAllowForm(true);
  }
  function startEditAllow(a: AllowanceType) {
    setEditingAllowId(a.id); setACode(a.code); setAName(a.name); setADefault(String(Number(a.defaultAmount))); setATaxable(a.isTaxable); setAFixed(a.isFixed); setFormError(''); setShowAllowForm(true);
  }

  async function handleAllowSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true); setFormError('');
    try {
      if (editingAllowId) {
        await updateAllowanceType(editingAllowId, { name: aName, isTaxable: aTaxable, isFixed: aFixed, ...(aDefault ? { defaultAmount: Number(aDefault) } : {}) });
      } else {
        await createAllowanceType({ code: aCode, name: aName, isTaxable: aTaxable, isFixed: aFixed, ...(aDefault ? { defaultAmount: Number(aDefault) } : {}) });
      }
      setShowAllowForm(false); loadAllow();
    } catch (e) { setFormError(e instanceof HrApiError ? e.message : 'Failed.'); }
    finally { setSaving(false); }
  }

  function startNewDed() {
    setEditingDedId(null); setDCode(''); setDName(''); setDCategory('mandatory'); setDIsPct(false); setDErShare(''); setDEeShare(''); setFormError(''); setShowDedForm(true);
  }
  function startEditDed(d: DeductionType) {
    setEditingDedId(d.id); setDCode(d.code); setDName(d.name); setDCategory(d.category); setDIsPct(d.isPercentage); setDErShare(String(Number(d.employerShare))); setDEeShare(String(Number(d.employeeShare))); setFormError(''); setShowDedForm(true);
  }

  async function handleDedSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true); setFormError('');
    try {
      if (editingDedId) {
        await updateDeductionType(editingDedId, {
          name: dName, category: dCategory, isPercentage: dIsPct,
          ...(dErShare ? { employerShare: Number(dErShare) } : {}),
          ...(dEeShare ? { employeeShare: Number(dEeShare) } : {}),
        });
      } else {
        await createDeductionType({
          code: dCode, name: dName, category: dCategory, isPercentage: dIsPct,
          ...(dErShare ? { employerShare: Number(dErShare) } : {}),
          ...(dEeShare ? { employeeShare: Number(dEeShare) } : {}),
        });
      }
      setShowDedForm(false); loadDed();
    } catch (e) { setFormError(e instanceof HrApiError ? e.message : 'Failed.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <div className="hr-toolbar__filters">
          <button type="button" className={`hr-btn${tab === 'allowances' ? ' hr-btn--primary' : ''}`} onClick={() => setTab('allowances')}>Allowance Types</button>
          <button type="button" className={`hr-btn${tab === 'deductions' ? ' hr-btn--primary' : ''}`} onClick={() => setTab('deductions')}>Deduction Types</button>
        </div>
        {canManage && tab === 'allowances' && (
          <button type="button" className="hr-btn hr-btn--primary" onClick={startNewAllow}>+ New Allowance Type</button>
        )}
        {canManage && tab === 'deductions' && (
          <button type="button" className="hr-btn hr-btn--primary" onClick={startNewDed}>+ New Deduction Type</button>
        )}
      </div>

      {error && <div className="hr-error">{error}</div>}

      {/* Allowance Type Form */}
      {showAllowForm && (
        <form className="hr-form" onSubmit={handleAllowSubmit} style={{ marginBottom: 16 }}>
          {formError && <div className="hr-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 140px 100px 100px', gap: 12, alignItems: 'end' }}>
            <div className="hr-field"><label>Code *</label><input required value={aCode} onChange={(e) => setACode(e.target.value)} disabled={!!editingAllowId} /></div>
            <div className="hr-field"><label>Name *</label><input required value={aName} onChange={(e) => setAName(e.target.value)} /></div>
            <div className="hr-field"><label>Default Amount</label><input type="number" step="0.01" value={aDefault} onChange={(e) => setADefault(e.target.value)} /></div>
            <div className="hr-field"><label><input type="checkbox" checked={aTaxable} onChange={(e) => setATaxable(e.target.checked)} /> Taxable</label></div>
            <div className="hr-field"><label><input type="checkbox" checked={aFixed} onChange={(e) => setAFixed(e.target.checked)} /> Fixed</label></div>
          </div>
          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setShowAllowForm(false)}>Cancel</button>
            <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>{saving ? 'Saving...' : (editingAllowId ? 'Update' : 'Create')}</button>
          </div>
        </form>
      )}

      {/* Deduction Type Form */}
      {showDedForm && (
        <form className="hr-form" onSubmit={handleDedSubmit} style={{ marginBottom: 16 }}>
          {formError && <div className="hr-error">{formError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 140px 120px 120px 100px', gap: 12, alignItems: 'end' }}>
            <div className="hr-field"><label>Code *</label><input required value={dCode} onChange={(e) => setDCode(e.target.value)} disabled={!!editingDedId} /></div>
            <div className="hr-field"><label>Name *</label><input required value={dName} onChange={(e) => setDName(e.target.value)} /></div>
            <div className="hr-field">
              <label>Category</label>
              <select value={dCategory} onChange={(e) => setDCategory(e.target.value)}>
                <option value="mandatory">Mandatory</option><option value="loan">Loan</option><option value="voluntary">Voluntary</option>
              </select>
            </div>
            <div className="hr-field"><label>ER Share {dIsPct ? '%' : '₱'}</label><input type="number" step="0.0001" value={dErShare} onChange={(e) => setDErShare(e.target.value)} /></div>
            <div className="hr-field"><label>EE Share {dIsPct ? '%' : '₱'}</label><input type="number" step="0.0001" value={dEeShare} onChange={(e) => setDEeShare(e.target.value)} /></div>
            <div className="hr-field"><label><input type="checkbox" checked={dIsPct} onChange={(e) => setDIsPct(e.target.checked)} /> % Based</label></div>
          </div>
          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setShowDedForm(false)}>Cancel</button>
            <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>{saving ? 'Saving...' : (editingDedId ? 'Update' : 'Create')}</button>
          </div>
        </form>
      )}

      {loading && <p>Loading...</p>}

      {tab === 'allowances' && !loading && (
        <>
          {allowTypes.length === 0 && <div className="hr-empty">No allowance types configured.</div>}
          {allowTypes.length > 0 && (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Default Amt</th><th>Taxable</th><th>Fixed</th><th>Employees</th><th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {allowTypes.map((a) => (
                  <tr key={a.id}>
                    <td className="hr-text-mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(a.defaultAmount)}</td>
                    <td>{a.isTaxable ? 'Yes' : 'No'}</td>
                    <td>{a.isFixed ? 'Yes' : 'No'}</td>
                    <td style={{ textAlign: 'right' }}>{a._count.employeeAllowances}</td>
                    <td><span className={`hr-badge hr-badge--${a.isActive ? 'active' : 'resigned'}`}>{a.isActive ? 'Active' : 'Inactive'}</span></td>
                    {canManage && (
                      <td><button type="button" className="hr-btn" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => startEditAllow(a)}>Edit</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'deductions' && !loading && (
        <>
          {dedTypes.length === 0 && <div className="hr-empty">No deduction types configured.</div>}
          {dedTypes.length > 0 && (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Category</th><th>Type</th><th>ER Share</th><th>EE Share</th><th>Employees</th><th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {dedTypes.map((d) => (
                  <tr key={d.id}>
                    <td className="hr-text-mono">{d.code}</td>
                    <td>{d.name}</td>
                    <td><span className={`hr-badge hr-badge--${d.category === 'mandatory' ? 'permanent' : d.category === 'loan' ? 'contractual' : 'casual'}`}>{d.category}</span></td>
                    <td>{d.isPercentage ? 'Percentage' : 'Fixed'}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{d.isPercentage ? `${Number(d.employerShare)}%` : formatPeso(d.employerShare)}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{d.isPercentage ? `${Number(d.employeeShare)}%` : formatPeso(d.employeeShare)}</td>
                    <td style={{ textAlign: 'right' }}>{d._count.employeeDeductions}</td>
                    <td><span className={`hr-badge hr-badge--${d.isActive ? 'active' : 'resigned'}`}>{d.isActive ? 'Active' : 'Inactive'}</span></td>
                    {canManage && (
                      <td><button type="button" className="hr-btn" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => startEditDed(d)}>Edit</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
