import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  approvePpmpItem,
  bulkApprovePpmpItems,
  createPpmpBatch,
  downloadPpmpTemplate,
  listEndUsers,
  listLookupDepartments,
  listPpmpItems,
  listProcurementFiscalYears,
  ProcurementApiError,
  updatePpmpItem,
  uploadPpmpExcel,
} from '../api';
import type {
  EndUser,
  LookupDepartment,
  PpmpItem,
  PpmpUploadResult,
  ProcurementFiscalYear,
} from '../api';

import { EndUserPicker } from './EndUserPicker';
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

interface EditState {
  id: string;
  itemDescription: string;
  quantity: string;
  estimatedUnitCost: string;
  modeOfProcurement: string;
  scheduleQuarter: string;
  cboNotes: string;
}

export function PpmpDataEntryPage() {
  const [fiscalYears, setFiscalYears] = useState<ProcurementFiscalYear[]>([]);
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [endUsers, setEndUsers] = useState<EndUser[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [selectedEndUserId, setSelectedEndUserId] = useState('');
  const [existingItems, setExistingItems] = useState<PpmpItem[]>([]);
  const [rows, setRows] = useState<FormRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  // Excel upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<PpmpUploadResult | null>(null);

  const selectedEndUser = useMemo(
    () => endUsers.find((u) => u.id === selectedEndUserId) ?? null,
    [endUsers, selectedEndUserId],
  );
  const departmentId = selectedEndUser?.departmentId ?? '';

  useEffect(() => {
    let cancelled = false;
    Promise.all([listProcurementFiscalYears(), listLookupDepartments(), listEndUsers()])
      .then(([fy, dept, eu]) => {
        if (cancelled) return;
        setFiscalYears(fy);
        setDepartments(dept);
        setEndUsers(eu);
        const firstFy = fy[0];
        if (firstFy) setSelectedFiscalYear(firstFy.id);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load reference data.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedFiscalYear || !selectedEndUserId) {
      setExistingItems([]);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    listPpmpItems({ fiscalYearId: selectedFiscalYear, endUserId: selectedEndUserId })
      .then((items) => {
        if (!cancelled) setExistingItems(items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFiscalYear, selectedEndUserId]);

  function reloadItems() {
    if (!selectedFiscalYear || !selectedEndUserId) return;
    listPpmpItems({ fiscalYearId: selectedFiscalYear, endUserId: selectedEndUserId })
      .then(setExistingItems)
      .catch(() => {});
  }

  function updateRow(index: number, field: keyof FormRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save(status: 'draft' | 'approved') {
    setError(null);
    setSuccess(null);
    if (!selectedEndUserId) {
      setError('Choose an end-user first (or add one).');
      return;
    }
    const valid = rows.filter(
      (r) => r.code && r.itemDescription && r.quantity && r.estimatedUnitCost,
    );
    if (valid.length === 0) {
      setError('Fill in at least one complete row (code, description, quantity, unit cost).');
      return;
    }
    setSaving(true);
    try {
      await createPpmpBatch({
        fiscalYearId: selectedFiscalYear,
        departmentId,
        endUserId: selectedEndUserId,
        status,
        items: valid.map((r) => ({
          code: r.code,
          itemDescription: r.itemDescription,
          procurementCategory: r.procurementCategory,
          unitOfMeasure: r.unitOfMeasure || 'pc',
          quantity: parseFloat(r.quantity),
          estimatedUnitCost: parseFloat(r.estimatedUnitCost),
          ...(r.modeOfProcurement ? { modeOfProcurement: r.modeOfProcurement } : {}),
          ...(r.scheduleQuarter ? { scheduleQuarter: parseInt(r.scheduleQuarter) } : {}),
          ...(r.cboNotes ? { cboNotes: r.cboNotes } : {}),
        })),
      });
      setSuccess(
        `${valid.length} item(s) saved${status === 'draft' ? ' as draft — you can edit them below' : ' and finalized into the APP'}.`,
      );
      setRows([emptyRow()]);
      reloadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to save items.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: PpmpItem) {
    setEditing({
      id: item.id,
      itemDescription: item.itemDescription,
      quantity: String(item.quantity),
      estimatedUnitCost: String(item.estimatedUnitCost),
      modeOfProcurement: item.modeOfProcurement ?? '',
      scheduleQuarter: item.scheduleQuarter ? String(item.scheduleQuarter) : '',
      cboNotes: item.cboNotes ?? '',
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setError(null);
    try {
      await updatePpmpItem(editing.id, {
        itemDescription: editing.itemDescription,
        quantity: parseFloat(editing.quantity),
        estimatedUnitCost: parseFloat(editing.estimatedUnitCost),
        ...(editing.modeOfProcurement ? { modeOfProcurement: editing.modeOfProcurement } : {}),
        ...(editing.scheduleQuarter ? { scheduleQuarter: parseInt(editing.scheduleQuarter) } : {}),
        ...(editing.cboNotes ? { cboNotes: editing.cboNotes } : {}),
      });
      setEditing(null);
      reloadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to update item.');
    }
  }

  async function finalize(id: string) {
    setError(null);
    try {
      await approvePpmpItem(id);
      reloadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to finalize item.');
    }
  }

  async function finalizeAllDrafts() {
    const draftIds = existingItems.filter((i) => i.status === 'draft').map((i) => i.id);
    if (draftIds.length === 0) return;
    setError(null);
    try {
      await bulkApprovePpmpItems(draftIds);
      setSuccess(`${draftIds.length} draft(s) finalized into the APP.`);
      reloadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to finalize drafts.');
    }
  }

  async function handleDownloadTemplate() {
    setError(null);
    try {
      await downloadPpmpTemplate();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to download template.');
    }
  }

  async function handleUpload() {
    setError(null);
    setSuccess(null);
    setUploadResult(null);
    if (!uploadFile) {
      setError('Choose an Excel file to upload first.');
      return;
    }
    if (!selectedFiscalYear || !selectedEndUserId) {
      setError('Select a fiscal year and an end-user before uploading.');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadPpmpExcel(uploadFile, {
        fiscalYearId: selectedFiscalYear,
        departmentId,
        endUserId: selectedEndUserId,
      });
      setUploadResult(result);
      if (result.created > 0) {
        setSuccess(`Uploaded ${result.created} PPMP item(s).`);
        setUploadFile(null);
        reloadItems();
      }
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const draftCount = existingItems.filter((i) => i.status === 'draft').length;
  const ready = Boolean(selectedFiscalYear && selectedEndUserId);
  const filledRows = rows.filter((r) => r.code && r.itemDescription).length;

  return (
    <div className="pr-page">
      <Link to="/procurement" className="pr-back">
        {'<-'} Back to Procurement
      </Link>
      <h1>PPMP Data Entry</h1>
      <p style={{ color: '#667085', fontSize: 14, marginBottom: 24 }}>
        Choose the fiscal year and the requesting end-user, then add all of that end-user's PPMP
        items and save them together. Save as a draft to keep editing, or finalize to include them
        in the APP.
      </p>

      {error && <div className="pr-error">{error}</div>}
      {success && (
        <div
          style={{
            background: '#ecfdf3',
            color: '#067647',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <div className="pr-field" style={{ flex: 1, minWidth: 200 }}>
          <label>Fiscal Year</label>
          <select value={selectedFiscalYear} onChange={(e) => setSelectedFiscalYear(e.target.value)}>
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name} ({fy.year})
              </option>
            ))}
          </select>
        </div>
        <div className="pr-field" style={{ flex: 2, minWidth: 280 }}>
          <label>Requesting End-User</label>
          <EndUserPicker
            endUsers={endUsers}
            value={selectedEndUserId}
            departments={departments}
            onChange={setSelectedEndUserId}
            onCreated={(created) => {
              setEndUsers((prev) => [...prev, created]);
              setSelectedEndUserId(created.id);
            }}
          />
        </div>
      </div>
      {selectedEndUser && (
        <p style={{ color: '#667085', fontSize: 13, margin: '0 0 24px' }}>
          Section: <strong>{selectedEndUser.department?.name ?? '—'}</strong>
          {selectedEndUser.position ? ` · ${selectedEndUser.position}` : ''}
        </p>
      )}

      {!ready && (
        <div className="pr-empty">Select a fiscal year and an end-user to begin.</div>
      )}

      {ready && (
        <>
          {/* Upload from Excel */}
          <div
            style={{
              border: '1px solid #e4e7ec',
              borderRadius: 10,
              padding: 20,
              marginBottom: 28,
              background: '#f9fafb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--mswd-navy)' }}>
                Upload from Excel
              </h2>
              <button className="pr-btn" type="button" onClick={handleDownloadTemplate}>
                ⬇ Download template
              </button>
            </div>
            <p style={{ color: '#667085', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
              Uploaded items are assigned to <strong>{selectedEndUser?.name}</strong> and finalized
              into the APP. A blank Code cell is auto-numbered.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="pr-field" style={{ flex: 2, minWidth: 240 }}>
                <label>Excel file (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setUploadFile(e.target.files?.[0] ?? null);
                    setUploadResult(null);
                  }}
                />
              </div>
              <button
                className="pr-btn pr-btn--primary"
                type="button"
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
              >
                {uploading ? 'Uploading…' : 'Upload PPMP'}
              </button>
            </div>
            {uploadResult && (
              <div style={{ marginTop: 14, fontSize: 13 }}>
                <strong>{uploadResult.created}</strong> item(s) created
                {uploadResult.skipped > 0 && (
                  <>
                    {' · '}
                    <strong style={{ color: '#b42318' }}>{uploadResult.skipped}</strong> skipped
                  </>
                )}
                {uploadResult.errors.length > 0 && (
                  <ul style={{ margin: '4px 0', paddingLeft: 18, color: '#b42318' }}>
                    {uploadResult.errors.map((e, i) => (
                      <li key={`e${i}`}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Existing items for this end-user */}
          {existingItems.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18, color: 'var(--mswd-navy)' }}>
                  {selectedEndUser?.name}'s Items ({existingItems.length})
                </h2>
                {draftCount > 0 && (
                  <button className="pr-btn pr-btn--success" onClick={finalizeAllDrafts}>
                    Finalize All Drafts ({draftCount})
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="pr-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
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
                    {existingItems.map((item) =>
                      editing?.id === item.id ? (
                        <tr key={item.id} style={{ background: '#fffaeb' }}>
                          <td>
                            <strong>{item.code}</strong>
                          </td>
                          <td>
                            <input
                              value={editing.itemDescription}
                              onChange={(e) =>
                                setEditing({ ...editing, itemDescription: e.target.value })
                              }
                              style={{ width: '100%' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={editing.quantity}
                              onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                              style={{ width: 70 }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={editing.estimatedUnitCost}
                              onChange={(e) =>
                                setEditing({ ...editing, estimatedUnitCost: e.target.value })
                              }
                              style={{ width: 90 }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: '#98a2b3' }}>—</td>
                          <td>
                            <select
                              value={editing.modeOfProcurement}
                              onChange={(e) =>
                                setEditing({ ...editing, modeOfProcurement: e.target.value })
                              }
                            >
                              <option value="">—</option>
                              {MODE_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={editing.scheduleQuarter}
                              onChange={(e) =>
                                setEditing({ ...editing, scheduleQuarter: e.target.value })
                              }
                            >
                              <option value="">—</option>
                              <option value="1">Q1</option>
                              <option value="2">Q2</option>
                              <option value="3">Q3</option>
                              <option value="4">Q4</option>
                            </select>
                          </td>
                          <td>draft</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="pr-btn pr-btn--primary"
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={saveEdit}
                            >
                              Save
                            </button>{' '}
                            <button
                              className="pr-btn"
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.code}</strong>
                          </td>
                          <td>{item.itemDescription}</td>
                          <td style={{ textAlign: 'right' }}>
                            {parseFloat(item.quantity).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {formatPeso(String(item.estimatedUnitCost))}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {formatPeso(String(item.estimatedTotalCost))}
                          </td>
                          <td style={{ fontSize: 11 }}>{item.modeOfProcurement ?? '—'}</td>
                          <td>{item.scheduleQuarter ?? '—'}</td>
                          <td>
                            <span className={`pr-badge pr-badge--${item.status}`}>
                              {item.status}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {item.status === 'draft' && (
                              <>
                                <button
                                  className="pr-btn"
                                  style={{ padding: '4px 10px', fontSize: 11 }}
                                  onClick={() => startEdit(item)}
                                >
                                  Edit
                                </button>{' '}
                                <button
                                  className="pr-btn pr-btn--success"
                                  style={{ padding: '4px 10px', fontSize: 11 }}
                                  onClick={() => finalize(item.id)}
                                >
                                  Finalize
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {loadingItems && <p style={{ color: '#667085' }}>Loading existing items…</p>}

          {/* New items grid */}
          <h2 style={{ fontSize: 18, color: 'var(--mswd-navy)', marginBottom: 16 }}>
            Add Items for {selectedEndUser?.name}
          </h2>

          {rows.map((row, idx) => (
            <div key={idx} className="pr-item-card">
              {rows.length > 1 && (
                <button
                  className="pr-item-card__remove"
                  onClick={() => removeRow(idx)}
                  title="Remove row"
                >
                  x
                </button>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div className="pr-field">
                  <label>PPMP Code</label>
                  <input
                    type="text"
                    value={row.code}
                    onChange={(e) => updateRow(idx, 'code', e.target.value)}
                    placeholder="ADM-001"
                  />
                </div>
                <div className="pr-field">
                  <label>Item Description</label>
                  <input
                    type="text"
                    value={row.itemDescription}
                    onChange={(e) => updateRow(idx, 'itemDescription', e.target.value)}
                    placeholder="Bond paper A4, 80gsm"
                  />
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 100px 120px',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div className="pr-field">
                  <label>Category</label>
                  <select
                    value={row.procurementCategory}
                    onChange={(e) => updateRow(idx, 'procurementCategory', e.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pr-field">
                  <label>UOM</label>
                  <input
                    type="text"
                    value={row.unitOfMeasure}
                    onChange={(e) => updateRow(idx, 'unitOfMeasure', e.target.value)}
                    placeholder="pc"
                  />
                </div>
                <div className="pr-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, 'quantity', e.target.value)}
                  />
                </div>
                <div className="pr-field">
                  <label>Unit Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.estimatedUnitCost}
                    onChange={(e) => updateRow(idx, 'estimatedUnitCost', e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 12 }}>
                <div className="pr-field">
                  <label>Mode of Procurement</label>
                  <select
                    value={row.modeOfProcurement}
                    onChange={(e) => updateRow(idx, 'modeOfProcurement', e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {MODE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pr-field">
                  <label>Quarter</label>
                  <select
                    value={row.scheduleQuarter}
                    onChange={(e) => updateRow(idx, 'scheduleQuarter', e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="1">Q1</option>
                    <option value="2">Q2</option>
                    <option value="3">Q3</option>
                    <option value="4">Q4</option>
                  </select>
                </div>
                <div className="pr-field">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={row.cboNotes}
                    onChange={(e) => updateRow(idx, 'cboNotes', e.target.value)}
                  />
                </div>
              </div>
              {row.quantity && row.estimatedUnitCost && (
                <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, color: '#475467' }}>
                  Total:{' '}
                  <strong>
                    {formatPeso(
                      (parseFloat(row.quantity) * parseFloat(row.estimatedUnitCost)).toFixed(2),
                    )}
                  </strong>
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button className="pr-btn" onClick={addRow}>
              + Add Another Row
            </button>
          </div>

          <div className="pr-form-actions">
            <button
              className="pr-btn"
              onClick={() => save('draft')}
              disabled={saving || filledRows === 0}
            >
              {saving ? 'Saving…' : `Save as Draft (${filledRows})`}
            </button>
            <button
              className="pr-btn pr-btn--primary"
              onClick={() => save('approved')}
              disabled={saving || filledRows === 0}
            >
              {saving ? 'Saving…' : `Finalize ${filledRows} Item(s)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
