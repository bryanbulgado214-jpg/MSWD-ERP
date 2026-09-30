import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  approvePpmpItem,
  bulkApprovePpmpItems,
  createPpmpItem,
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

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);

const MODE_OPTIONS = [
  'Shopping',
  'Small Value Procurement',
  'Competitive Bidding',
  'Direct Contracting',
  'Direct Acquisition',
  'Negotiated Procurement',
  'Agency-to-Agency',
];

const QUARTERS = ['1', '2', '3', '4'] as const;
type QuarterMap = { '1': string; '2': string; '3': string; '4': string };
const emptySched = (): QuarterMap => ({ '1': '', '2': '', '3': '', '4': '' });

interface FormRow {
  code: string;
  itemDescription: string;
  procurementCategory: string;
  unitOfMeasure: string;
  quantity: string;
  estimatedUnitCost: string;
  modeOfProcurement: string;
  sched: QuarterMap;
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
  sched: emptySched(),
  cboNotes: '',
});

interface EditState {
  itemDescription: string;
  quantity: string;
  estimatedUnitCost: string;
  procurementCategory: string;
  unitOfMeasure: string;
  modeOfProcurement: string;
  sched: QuarterMap;
  cboNotes: string;
}

/** Sum the per-quarter quantities. */
function schedTotal(s: QuarterMap): number {
  return QUARTERS.reduce((a, q) => a + (parseFloat(s[q]) || 0), 0);
}

/** { "1": 6, "3": 6 } from the form's quarter inputs (drops zeros). */
function schedObject(s: QuarterMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of QUARTERS) {
    const v = parseFloat(s[q]) || 0;
    if (v > 0) out[q] = v;
  }
  return out;
}

/** A stored schedule back into the 4 quarter input strings. */
function schedToMap(raw: Record<string, number> | null | undefined): QuarterMap {
  const m = emptySched();
  if (raw) for (const q of QUARTERS) if (raw[q]) m[q] = String(raw[q]);
  return m;
}

/** "Q1: 6 · Q3: 6 · Q4: 6" for display. */
function schedLabel(raw: Record<string, number> | null | undefined, fallbackQuarter?: number | null): string {
  if (raw && Object.keys(raw).length) {
    return QUARTERS.filter((q) => raw[q]).map((q) => `Q${q}: ${raw[q]}`).join(' · ');
  }
  return fallbackQuarter ? `Q${fallbackQuarter}` : '—';
}

function ScheduleEditor({
  sched,
  onChange,
  quantity,
}: {
  sched: QuarterMap;
  onChange: (q: (typeof QUARTERS)[number], value: string) => void;
  quantity: number;
}) {
  const total = schedTotal(sched);
  const matches = quantity > 0 && Math.abs(total - quantity) < 0.0001;
  return (
    <div className="pr-field">
      <label>Schedule by quarter — spread the quantity across the quarters it will be bought</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {QUARTERS.map((q) => (
          <label
            key={q}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}
          >
            <span style={{ color: '#667085', fontWeight: 700 }}>Q{q}</span>
            <input
              type="number"
              min="0"
              value={sched[q]}
              onChange={(e) => onChange(q, e.target.value)}
              style={{ width: 64 }}
            />
          </label>
        ))}
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: matches ? '#067647' : quantity > 0 ? '#b42318' : '#98a2b3',
          }}
        >
          {quantity <= 0
            ? 'Enter a quantity first'
            : matches
              ? `✓ ${total} scheduled`
              : `Scheduled ${total} of ${quantity} — must match`}
        </span>
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { fontSize: 12, color: '#475467' };
const detailLabel: React.CSSProperties = { fontSize: 11, color: '#98a2b3', marginBottom: 2 };
const detailVal: React.CSSProperties = { fontSize: 13, color: '#101828' };

export function PpmpDataEntryPage() {
  const [fiscalYears, setFiscalYears] = useState<ProcurementFiscalYear[]>([]);
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [endUsers, setEndUsers] = useState<EndUser[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [selectedEndUserId, setSelectedEndUserId] = useState('');
  const [existingItems, setExistingItems] = useState<PpmpItem[]>([]);
  const [form, setForm] = useState<FormRow>(emptyRow());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
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

  // Collapse an expanded (read-only) row when the user clicks elsewhere. While a
  // row is being edited we keep it open so the edits aren't lost.
  useEffect(() => {
    if (!expandedId || editingId) return;
    function onDocMouseDown() {
      setExpandedId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [expandedId, editingId]);

  function reloadItems() {
    if (!selectedFiscalYear || !selectedEndUserId) return;
    listPpmpItems({ fiscalYearId: selectedFiscalYear, endUserId: selectedEndUserId })
      .then(setExistingItems)
      .catch(() => {});
  }

  function updateForm(field: keyof Omit<FormRow, 'sched'>, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }
  function updateSched(q: (typeof QUARTERS)[number], value: string) {
    setForm((prev) => ({ ...prev, sched: { ...prev.sched, [q]: value } }));
  }

  const formQty = parseFloat(form.quantity) || 0;
  const formScheduled = schedTotal(form.sched);
  const scheduleMatches = formQty > 0 && Math.abs(formScheduled - formQty) < 0.0001;
  const formComplete = Boolean(
    form.code && form.itemDescription && form.quantity && form.estimatedUnitCost && scheduleMatches,
  );

  async function addItem() {
    setError(null);
    setSuccess(null);
    if (!selectedEndUserId) {
      setError('Choose an end-user first (or add one).');
      return;
    }
    if (!(form.code && form.itemDescription && form.quantity && form.estimatedUnitCost)) {
      setError('Fill in Code, Description, Quantity, and Unit Cost before adding.');
      return;
    }
    if (!scheduleMatches) {
      setError(
        `The quarter schedule totals ${formScheduled}, but the quantity is ${formQty}. They must match.`,
      );
      return;
    }
    setAdding(true);
    try {
      await createPpmpItem({
        fiscalYearId: selectedFiscalYear,
        departmentId,
        endUserId: selectedEndUserId,
        status: 'draft',
        code: form.code,
        itemDescription: form.itemDescription,
        procurementCategory: form.procurementCategory,
        unitOfMeasure: form.unitOfMeasure || 'pc',
        quantity: parseFloat(form.quantity),
        estimatedUnitCost: parseFloat(form.estimatedUnitCost),
        ...(form.modeOfProcurement ? { modeOfProcurement: form.modeOfProcurement } : {}),
        scheduleByQuarter: schedObject(form.sched),
        ...(form.cboNotes ? { cboNotes: form.cboNotes } : {}),
      });
      setForm(emptyRow());
      reloadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to add item.');
    } finally {
      setAdding(false);
    }
  }

  function toggleRow(id: string) {
    if (editingId) return; // don't collapse mid-edit
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function startEdit(item: PpmpItem) {
    setExpandedId(item.id);
    setEditingId(item.id);
    setEdit({
      itemDescription: item.itemDescription,
      quantity: String(item.quantity),
      estimatedUnitCost: String(item.estimatedUnitCost),
      procurementCategory: item.procurementCategory,
      unitOfMeasure: item.unitOfMeasure,
      modeOfProcurement: item.modeOfProcurement ?? '',
      sched: schedToMap(item.scheduleByQuarter),
      cboNotes: item.cboNotes ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit(id: string) {
    if (!edit) return;
    setError(null);
    const editQty = parseFloat(edit.quantity) || 0;
    const editScheduled = schedTotal(edit.sched);
    if (!(editQty > 0 && Math.abs(editScheduled - editQty) < 0.0001)) {
      setError(
        `The quarter schedule totals ${editScheduled}, but the quantity is ${editQty}. They must match.`,
      );
      return;
    }
    try {
      await updatePpmpItem(id, {
        itemDescription: edit.itemDescription,
        procurementCategory: edit.procurementCategory,
        unitOfMeasure: edit.unitOfMeasure || 'pc',
        quantity: parseFloat(edit.quantity),
        estimatedUnitCost: parseFloat(edit.estimatedUnitCost),
        ...(edit.modeOfProcurement ? { modeOfProcurement: edit.modeOfProcurement } : {}),
        scheduleByQuarter: schedObject(edit.sched),
        ...(edit.cboNotes ? { cboNotes: edit.cboNotes } : {}),
      });
      setEditingId(null);
      setEdit(null);
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
  const liveTotal =
    form.quantity && form.estimatedUnitCost
      ? parseFloat(form.quantity) * parseFloat(form.estimatedUnitCost)
      : 0;

  return (
    <div className="pr-page">
      <Link to="/procurement" className="pr-back">
        {'<-'} Back to Procurement
      </Link>
      <h1 style={{ marginBottom: 4 }}>PPMP Data Entry</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: 0, marginBottom: 18 }}>
        Pick the fiscal year and end-user, then add one item at a time — each goes into the list
        above. Click a saved item to see its details; finalize when the list is complete.
      </p>

      {error && <div className="pr-error">{error}</div>}
      {success && (
        <div
          style={{
            background: '#ecfdf3',
            color: '#067647',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <div className="pr-field" style={{ flex: 1, minWidth: 180 }}>
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
        <p style={{ color: '#667085', fontSize: 12, margin: '0 0 20px' }}>
          Section: <strong>{selectedEndUser.department?.name ?? '—'}</strong>
          {selectedEndUser.position ? ` · ${selectedEndUser.position}` : ''}
        </p>
      )}

      {!ready && <div className="pr-empty">Select a fiscal year and an end-user to begin.</div>}

      {ready && (
        <>
          {/* Saved items — compact list, click a row to expand */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, color: 'var(--mswd-navy)' }}>
              {selectedEndUser?.name}'s Items ({existingItems.length})
            </h2>
            {draftCount > 0 && (
              <button
                className="pr-btn pr-btn--success"
                style={{ padding: '5px 12px', fontSize: 13 }}
                onClick={finalizeAllDrafts}
              >
                Finalize All Drafts ({draftCount})
              </button>
            )}
          </div>

          {existingItems.length === 0 && !loadingItems && (
            <div className="pr-empty" style={{ marginBottom: 20 }}>
              No items yet — add the first one below.
            </div>
          )}

          {existingItems.length > 0 && (
            <div
              style={{
                border: '1px solid #e4e7ec',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: 24,
              }}
            >
              {/* header row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 56px 110px 84px 150px',
                  gap: 8,
                  padding: '8px 14px',
                  background: '#f9fafb',
                  borderBottom: '1px solid #e4e7ec',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#667085',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}
              >
                <div>Code</div>
                <div>Description</div>
                <div style={{ textAlign: 'right' }}>Qty</div>
                <div style={{ textAlign: 'right' }}>Total</div>
                <div>Status</div>
                <div />
              </div>

              {existingItems.map((item) => {
                const isOpen = expandedId === item.id;
                const isEditing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ borderBottom: '1px solid #f2f4f7' }}
                  >
                    <div
                      onClick={() => toggleRow(item.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 1fr 56px 110px 84px 150px',
                        gap: 8,
                        padding: '10px 14px',
                        alignItems: 'center',
                        cursor: 'pointer',
                        background: isOpen ? '#f9fafb' : '#fff',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{item.code}</div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.itemDescription}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {parseFloat(item.quantity).toLocaleString()}
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatPeso(String(item.estimatedTotalCost))}
                      </div>
                      <div>
                        <span className={`pr-badge pr-badge--${item.status}`}>{item.status}</span>
                      </div>
                      <div
                        style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.status === 'draft' && !isEditing && (
                          <>
                            <button
                              className="pr-btn"
                              style={{ padding: '3px 10px', fontSize: 11 }}
                              onClick={() => startEdit(item)}
                            >
                              Edit
                            </button>{' '}
                            <button
                              className="pr-btn pr-btn--success"
                              style={{ padding: '3px 10px', fontSize: 11 }}
                              onClick={() => finalize(item.id)}
                            >
                              Finalize
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '4px 14px 16px', background: '#f9fafb' }}>
                        {isEditing && edit ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                            <div className="pr-field">
                              <label>Item Description</label>
                              <input
                                value={edit.itemDescription}
                                onChange={(e) =>
                                  setEdit({ ...edit, itemDescription: e.target.value })
                                }
                              />
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 90px 90px 110px',
                                gap: 10,
                              }}
                            >
                              <div className="pr-field">
                                <label>Category</label>
                                <select
                                  value={edit.procurementCategory}
                                  onChange={(e) =>
                                    setEdit({ ...edit, procurementCategory: e.target.value })
                                  }
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
                                  value={edit.unitOfMeasure}
                                  onChange={(e) =>
                                    setEdit({ ...edit, unitOfMeasure: e.target.value })
                                  }
                                />
                              </div>
                              <div className="pr-field">
                                <label>Qty</label>
                                <input
                                  type="number"
                                  value={edit.quantity}
                                  onChange={(e) => setEdit({ ...edit, quantity: e.target.value })}
                                />
                              </div>
                              <div className="pr-field">
                                <label>Unit Cost</label>
                                <input
                                  type="number"
                                  value={edit.estimatedUnitCost}
                                  onChange={(e) =>
                                    setEdit({ ...edit, estimatedUnitCost: e.target.value })
                                  }
                                />
                              </div>
                            </div>
                            <div
                              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
                            >
                              <div className="pr-field">
                                <label>Mode of Procurement</label>
                                <select
                                  value={edit.modeOfProcurement}
                                  onChange={(e) =>
                                    setEdit({ ...edit, modeOfProcurement: e.target.value })
                                  }
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
                                <label>Notes</label>
                                <input
                                  value={edit.cboNotes}
                                  onChange={(e) => setEdit({ ...edit, cboNotes: e.target.value })}
                                />
                              </div>
                            </div>
                            <ScheduleEditor
                              sched={edit.sched}
                              onChange={(q, v) =>
                                setEdit({ ...edit, sched: { ...edit.sched, [q]: v } })
                              }
                              quantity={parseFloat(edit.quantity) || 0}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                className="pr-btn pr-btn--primary"
                                style={{ padding: '5px 14px', fontSize: 13 }}
                                onClick={() => saveEdit(item.id)}
                              >
                                Save
                              </button>
                              <button
                                className="pr-btn"
                                style={{ padding: '5px 14px', fontSize: 13 }}
                                onClick={cancelEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                              gap: 14,
                            }}
                          >
                            <div>
                              <div style={detailLabel}>Category</div>
                              <div style={detailVal}>
                                {CATEGORY_LABELS[item.procurementCategory] ??
                                  item.procurementCategory}
                              </div>
                            </div>
                            <div>
                              <div style={detailLabel}>Unit of Measure</div>
                              <div style={detailVal}>{item.unitOfMeasure}</div>
                            </div>
                            <div>
                              <div style={detailLabel}>Unit Cost</div>
                              <div style={detailVal}>
                                {formatPeso(String(item.estimatedUnitCost))}
                              </div>
                            </div>
                            <div>
                              <div style={detailLabel}>Mode of Procurement</div>
                              <div style={detailVal}>{item.modeOfProcurement ?? '—'}</div>
                            </div>
                            <div>
                              <div style={detailLabel}>Schedule by Quarter</div>
                              <div style={detailVal}>
                                {schedLabel(item.scheduleByQuarter, item.scheduleQuarter)}
                              </div>
                            </div>
                            <div>
                              <div style={detailLabel}>Notes</div>
                              <div style={detailVal}>{item.cboNotes || '—'}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Total for this end-user — to validate the PPMP was entered right */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 56px 110px 84px 150px',
                  gap: 8,
                  padding: '10px 14px',
                  background: '#f9fafb',
                  borderTop: '2px solid #d0d5dd',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#101828',
                }}
              >
                <div style={{ gridColumn: '1 / 3' }}>
                  Total — {existingItems.length} item{existingItems.length === 1 ? '' : 's'}
                </div>
                <div />
                <div style={{ textAlign: 'right' }}>
                  {formatPeso(
                    existingItems
                      .reduce((s, it) => s + Number(it.estimatedTotalCost), 0)
                      .toFixed(2),
                  )}
                </div>
                <div />
                <div />
              </div>
            </div>
          )}

          {/* Single entry form + Add */}
          <div
            style={{
              border: '1px solid #d0d5dd',
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
              background: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--mswd-navy)' }}>
                Add an item{selectedEndUser ? ` for ${selectedEndUser.name}` : ''}
              </h3>
              {liveTotal > 0 && (
                <span style={cell}>
                  Total: <strong>{formatPeso(liveTotal.toFixed(2))}</strong>
                </span>
              )}
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, marginBottom: 10 }}
            >
              <div className="pr-field">
                <label>PPMP Code</label>
                <input
                  value={form.code}
                  onChange={(e) => updateForm('code', e.target.value)}
                  placeholder="ADM-001"
                />
              </div>
              <div className="pr-field">
                <label>Item Description</label>
                <input
                  value={form.itemDescription}
                  onChange={(e) => updateForm('itemDescription', e.target.value)}
                  placeholder="Bond paper A4, 80gsm"
                />
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 110px 1fr',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div className="pr-field">
                <label>Category</label>
                <select
                  value={form.procurementCategory}
                  onChange={(e) => updateForm('procurementCategory', e.target.value)}
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
                  value={form.unitOfMeasure}
                  onChange={(e) => updateForm('unitOfMeasure', e.target.value)}
                  placeholder="pc"
                />
              </div>
              <div className="pr-field">
                <label>Qty</label>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => updateForm('quantity', e.target.value)}
                />
              </div>
              <div className="pr-field">
                <label>Unit Cost</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimatedUnitCost}
                  onChange={(e) => updateForm('estimatedUnitCost', e.target.value)}
                />
              </div>
              <div className="pr-field">
                <label>Mode of Procurement</label>
                <select
                  value={form.modeOfProcurement}
                  onChange={(e) => updateForm('modeOfProcurement', e.target.value)}
                >
                  <option value="">— Select —</option>
                  {MODE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <ScheduleEditor sched={form.sched} onChange={updateSched} quantity={formQty} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                alignItems: 'end',
              }}
            >
              <div className="pr-field">
                <label>Notes</label>
                <input
                  value={form.cboNotes}
                  onChange={(e) => updateForm('cboNotes', e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <button
                className="pr-btn pr-btn--primary"
                style={{ padding: '8px 22px', whiteSpace: 'nowrap' }}
                onClick={addItem}
                disabled={adding || !formComplete}
              >
                {adding ? 'Adding…' : '+ Add to List'}
              </button>
            </div>
          </div>

          {/* Excel upload — compact */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              fontSize: 13,
              color: '#667085',
              borderTop: '1px dashed #e4e7ec',
              paddingTop: 14,
            }}
          >
            <span>Or upload a filled Excel template for {selectedEndUser?.name}:</span>
            <button className="pr-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleDownloadTemplate}>
              ⬇ Template
            </button>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                setUploadFile(e.target.files?.[0] ?? null);
                setUploadResult(null);
              }}
            />
            <button
              className="pr-btn"
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {uploadResult && (
              <span style={{ color: uploadResult.created > 0 ? '#067647' : '#b42318' }}>
                {uploadResult.created} created
                {uploadResult.skipped > 0 ? ` · ${uploadResult.skipped} skipped` : ''}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
