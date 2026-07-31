import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listDepartments, listFiscalYears, listUsers } from '../../budgeting/api';
import type { FiscalYearLookupItem, LookupItem, UserLookupItem } from '../../budgeting/api';
import { formatPeso } from '../../budgeting/format-peso';
import {
  approvePpmpItem,
  bulkApprovePpmpItems,
  createPpmpItem,
  listPpmpItems,
  ProcurementApiError,
} from '../api';
import type { PpmpItem } from '../api';
import './procurement.css';

const CATEGORY_OPTIONS = [
  { value: 'goods', label: 'Goods' },
  { value: 'services', label: 'Services' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'consulting_services', label: 'Consulting Services' },
];

const MODE_OPTIONS = [
  'Shopping',
  'Small Value Procurement',
  'Competitive Bidding',
  'Direct Contracting',
  'Negotiated Procurement',
  'Agency-to-Agency',
];

interface FormRow {
  assignedUserId: string;
  code: string;
  itemDescription: string;
  procurementCategory: string;
  unitOfMeasure: string;
  quantity: string;
  estimatedUnitCost: string;
  modeOfProcurement: string;
  scheduleQuarter: string;
  cboNotes: string;
}

const emptyRow = (): FormRow => ({
  assignedUserId: '',
  code: '',
  itemDescription: '',
  procurementCategory: 'goods',
  unitOfMeasure: '',
  quantity: '',
  estimatedUnitCost: '',
  modeOfProcurement: '',
  scheduleQuarter: '',
  cboNotes: '',
});

export function PpmpDataEntryPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearLookupItem[]>([]);
  const [departments, setDepartments] = useState<LookupItem[]>([]);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [existingItems, setExistingItems] = useState<PpmpItem[]>([]);
  const [rows, setRows] = useState<FormRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFiscalYears(), listDepartments(), listUsers()])
      .then(([fy, dept, u]) => {
        if (cancelled) return;
        setFiscalYears(fy);
        setDepartments(dept);
        setUsers(u);
        if (fy.length > 0) setSelectedFiscalYear(fy[0].id);
        if (dept.length > 0) setSelectedDepartment(dept[0].id);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load reference data.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedFiscalYear || !selectedDepartment) return;
    let cancelled = false;
    setLoadingItems(true);
    listPpmpItems({ fiscalYearId: selectedFiscalYear, departmentId: selectedDepartment })
      .then((items) => { if (!cancelled) setExistingItems(items); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [selectedFiscalYear, selectedDepartment]);

  function updateRow(index: number, field: keyof FormRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const valid = rows.filter((r) => r.code && r.itemDescription && r.quantity && r.estimatedUnitCost);
    if (valid.length === 0) {
      setError('Fill in at least one complete row (code, description, quantity, unit cost).');
      return;
    }

    setSaving(true);
    try {
      for (const row of valid) {
        await createPpmpItem({
          fiscalYearId: selectedFiscalYear,
          departmentId: selectedDepartment,
          ...(row.assignedUserId ? { assignedUserId: row.assignedUserId } : {}),
          code: row.code,
          itemDescription: row.itemDescription,
          procurementCategory: row.procurementCategory,
          unitOfMeasure: row.unitOfMeasure || 'pc',
          quantity: parseFloat(row.quantity),
          estimatedUnitCost: parseFloat(row.estimatedUnitCost),
          ...(row.modeOfProcurement ? { modeOfProcurement: row.modeOfProcurement } : {}),
          ...(row.scheduleQuarter ? { scheduleQuarter: parseInt(row.scheduleQuarter) } : {}),
          ...(row.cboNotes ? { cboNotes: row.cboNotes } : {}),
        });
      }
      setSuccess(`${valid.length} PPMP item(s) saved successfully.`);
      setRows([emptyRow()]);
      const updated = await listPpmpItems({ fiscalYearId: selectedFiscalYear, departmentId: selectedDepartment });
      setExistingItems(updated);
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to save items.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    try {
      await approvePpmpItem(id);
      setExistingItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'approved' } : i)));
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to approve item.');
    }
  }

  async function handleBulkApprove() {
    const draftIds = existingItems.filter((i) => i.status === 'draft').map((i) => i.id);
    if (draftIds.length === 0) return;
    try {
      await bulkApprovePpmpItems(draftIds);
      setExistingItems((prev) => prev.map((i) => (draftIds.includes(i.id) ? { ...i, status: 'approved' } : i)));
      setSuccess(`${draftIds.length} item(s) approved.`);
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to approve items.');
    }
  }

  const draftCount = existingItems.filter((i) => i.status === 'draft').length;

  return (
    <div className="pr-page">
      <Link to="/procurement" className="pr-back">{'<-'} Back to Procurement</Link>
      <h1>PPMP Data Entry</h1>
      <p style={{ color: '#667085', fontSize: 14, marginBottom: 24 }}>
        Enter PPMP items from the Excel file. Assign each item to an end-user so they can see their allocations when creating Purchase Requests.
      </p>

      {error && <div className="pr-error">{error}</div>}
      {success && <div style={{ background: '#ecfdf3', color: '#067647', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{success}</div>}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="pr-field" style={{ flex: 1, minWidth: 200 }}>
          <label>Fiscal Year</label>
          <select value={selectedFiscalYear} onChange={(e) => setSelectedFiscalYear(e.target.value)}>
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>{fy.name} ({fy.year})</option>
            ))}
          </select>
        </div>
        <div className="pr-field" style={{ flex: 1, minWidth: 200 }}>
          <label>Department</label>
          <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Existing items */}
      {existingItems.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--mswd-navy)' }}>
              Existing Items ({existingItems.length})
            </h2>
            {draftCount > 0 && (
              <button className="pr-btn pr-btn--success" onClick={handleBulkApprove}>
                Approve All Drafts ({draftCount})
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Assigned To</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Mode</th>
                  <th>Q</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {existingItems.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.code}</strong></td>
                    <td>{item.itemDescription}</td>
                    <td>{item.assignedUser?.username ?? '—'}</td>
                    <td>{item.unitOfMeasure}</td>
                    <td style={{ textAlign: 'right' }}>{parseFloat(item.quantity).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{formatPeso(String(item.estimatedUnitCost))}</td>
                    <td style={{ textAlign: 'right' }}>{formatPeso(String(item.estimatedTotalCost))}</td>
                    <td style={{ fontSize: 11 }}>{item.modeOfProcurement ?? '—'}</td>
                    <td>{item.scheduleQuarter ?? '—'}</td>
                    <td>
                      <span className={`pr-badge pr-badge--${item.status}`}>{item.status}</span>
                    </td>
                    <td>
                      {item.status === 'draft' && (
                        <button className="pr-btn pr-btn--success" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => handleApprove(item.id)}>
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {loadingItems && <p style={{ color: '#667085' }}>Loading existing items...</p>}

      {/* Entry form */}
      <h2 style={{ fontSize: 18, color: 'var(--mswd-navy)', marginBottom: 16 }}>Add New Items</h2>

      {rows.map((row, idx) => (
        <div key={idx} className="pr-item-card">
          {rows.length > 1 && (
            <button className="pr-item-card__remove" onClick={() => removeRow(idx)} title="Remove row">x</button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="pr-field">
              <label>Assigned End-User</label>
              <select value={row.assignedUserId} onChange={(e) => updateRow(idx, 'assignedUserId', e.target.value)}>
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>
            <div className="pr-field">
              <label>PPMP Code (e.g. JBS-001)</label>
              <input type="text" value={row.code} onChange={(e) => updateRow(idx, 'code', e.target.value)} placeholder="JBS-001" />
            </div>
          </div>
          <div className="pr-field" style={{ marginBottom: 12 }}>
            <label>Item Description</label>
            <input type="text" value={row.itemDescription} onChange={(e) => updateRow(idx, 'itemDescription', e.target.value)} placeholder="Money Counting Machine" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 120px', gap: 12, marginBottom: 12 }}>
            <div className="pr-field">
              <label>Category</label>
              <select value={row.procurementCategory} onChange={(e) => updateRow(idx, 'procurementCategory', e.target.value)}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="pr-field">
              <label>UOM</label>
              <input type="text" value={row.unitOfMeasure} onChange={(e) => updateRow(idx, 'unitOfMeasure', e.target.value)} placeholder="pc" />
            </div>
            <div className="pr-field">
              <label>Quantity</label>
              <input type="number" min="0" step="1" value={row.quantity} onChange={(e) => updateRow(idx, 'quantity', e.target.value)} />
            </div>
            <div className="pr-field">
              <label>Unit Cost</label>
              <input type="number" min="0" step="0.01" value={row.estimatedUnitCost} onChange={(e) => updateRow(idx, 'estimatedUnitCost', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 12 }}>
            <div className="pr-field">
              <label>Mode of Procurement</label>
              <select value={row.modeOfProcurement} onChange={(e) => updateRow(idx, 'modeOfProcurement', e.target.value)}>
                <option value="">— Select —</option>
                {MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="pr-field">
              <label>Quarter</label>
              <select value={row.scheduleQuarter} onChange={(e) => updateRow(idx, 'scheduleQuarter', e.target.value)}>
                <option value="">—</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </div>
            <div className="pr-field">
              <label>CBO Notes</label>
              <input type="text" value={row.cboNotes} onChange={(e) => updateRow(idx, 'cboNotes', e.target.value)} placeholder="APPROVED" />
            </div>
          </div>
          {row.quantity && row.estimatedUnitCost && (
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, color: '#475467' }}>
              Total: <strong>{formatPeso((parseFloat(row.quantity) * parseFloat(row.estimatedUnitCost)).toFixed(2))}</strong>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button className="pr-btn" onClick={addRow}>+ Add Another Row</button>
      </div>

      <div className="pr-form-actions">
        <Link to="/procurement" className="pr-btn" style={{ textDecoration: 'none' }}>Cancel</Link>
        <button className="pr-btn pr-btn--primary" onClick={handleSave} disabled={saving || !selectedFiscalYear || !selectedDepartment}>
          {saving ? 'Saving...' : `Save ${rows.filter((r) => r.code && r.itemDescription).length} Item(s)`}
        </button>
      </div>
    </div>
  );
}
