import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  consolidateApp,
  createAppItem,
  listAppItems,
  listEndUsers,
  listLookupDepartments,
  listProcurementFiscalYears,
  ProcurementApiError,
} from '../api';
import type { AppItem, EndUser, LookupDepartment, ProcurementFiscalYear } from '../api';
import './procurement.css';

const CATEGORY_LABEL: Record<string, string> = {
  goods: 'Goods',
  services: 'Services',
  infrastructure: 'Infrastructure',
  consulting_services: 'Consulting Services',
};

// Month (1-12) → quarter label; used for a direct line's schedule display.
function quarterOf(month: number | null | undefined): number | null {
  return month && month >= 1 && month <= 12 ? Math.ceil(month / 3) : null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DirectForm {
  title: string;
  category: string;
  departmentId: string;
  endUserId: string;
  quantity: string;
  unitOfMeasure: string;
  estimatedUnitCost: string;
  approvedBudget: string;
  procurementMode: string;
  scheduleMonth: string;
}

const EMPTY_DIRECT: DirectForm = {
  title: '',
  category: 'goods',
  departmentId: '',
  endUserId: '',
  quantity: '',
  unitOfMeasure: '',
  estimatedUnitCost: '',
  approvedBudget: '',
  procurementMode: '',
  scheduleMonth: '',
};

interface Group {
  key: string;
  office: string;
  items: AppItem[];
  subtotal: number;
}

export function AppConsolidationPage() {
  const [fiscalYears, setFiscalYears] = useState<ProcurementFiscalYear[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [items, setItems] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // "Add item not in PPMP" form.
  const [departments, setDepartments] = useState<LookupDepartment[]>([]);
  const [endUsers, setEndUsers] = useState<EndUser[]>([]);
  const [showDirect, setShowDirect] = useState(false);
  const [direct, setDirect] = useState<DirectForm>(EMPTY_DIRECT);
  const [savingDirect, setSavingDirect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listProcurementFiscalYears()
      .then((fy) => {
        if (cancelled) return;
        setFiscalYears(fy);
        if (fy[0]) setSelectedFiscalYear(fy[0].id);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load fiscal years.');
      });
    // Offices + end-users for the direct-item form.
    listLookupDepartments()
      .then((d) => !cancelled && setDepartments(d))
      .catch(() => {});
    listEndUsers()
      .then((e) => !cancelled && setEndUsers(e))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function loadItems() {
    if (!selectedFiscalYear) return;
    setLoading(true);
    listAppItems({ fiscalYearId: selectedFiscalYear })
      .then(setItems)
      .catch((err) =>
        setError(err instanceof ProcurementApiError ? err.message : 'Failed to load APP.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadItems();
    setSuccess(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiscalYear]);

  async function handleConsolidate() {
    setError(null);
    setSuccess(null);
    if (!selectedFiscalYear) return;
    setConsolidating(true);
    try {
      const res = await consolidateApp(selectedFiscalYear);
      setSuccess(
        `${res.created} new APP line(s) added from approved PPMPs — ` +
          `${res.totalApprovedPpmp} approved item(s), grand total ${formatPeso(res.grandTotalBudget)}.`,
      );
      loadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Consolidation failed.');
    } finally {
      setConsolidating(false);
    }
  }

  // Default the approved budget to quantity × unit cost unless the user set one.
  const directBudget =
    direct.approvedBudget.trim() !== ''
      ? direct.approvedBudget
      : direct.quantity && direct.estimatedUnitCost
        ? ((parseFloat(direct.quantity) || 0) * (parseFloat(direct.estimatedUnitCost) || 0)).toFixed(2)
        : '';

  async function handleAddDirect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedFiscalYear) return;
    if (!direct.title.trim()) {
      setError('Procurement project / item is required.');
      return;
    }
    const budget = directBudget;
    if (!budget || parseFloat(budget) <= 0) {
      setError('Enter an estimated unit cost + quantity, or an approved budget.');
      return;
    }
    setSavingDirect(true);
    try {
      await createAppItem({
        fiscalYearId: selectedFiscalYear,
        procurementProjectTitle: direct.title.trim(),
        procurementCategory: direct.category,
        approvedBudget: budget,
        ...(direct.procurementMode.trim() ? { procurementMode: direct.procurementMode.trim() } : {}),
        ...(direct.scheduleMonth ? { scheduleMonth: Number(direct.scheduleMonth) } : {}),
        ...(direct.departmentId ? { departmentId: direct.departmentId } : {}),
        ...(direct.endUserId ? { endUserId: direct.endUserId } : {}),
        ...(direct.quantity ? { quantity: direct.quantity } : {}),
        ...(direct.unitOfMeasure.trim() ? { unitOfMeasure: direct.unitOfMeasure.trim() } : {}),
        ...(direct.estimatedUnitCost ? { estimatedUnitCost: direct.estimatedUnitCost } : {}),
      });
      setSuccess(`Added "${direct.title.trim()}" to the APP (not in any PPMP).`);
      setDirect(EMPTY_DIRECT);
      setShowDirect(false);
      loadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Failed to add APP item.');
    } finally {
      setSavingDirect(false);
    }
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const dept = it.department ?? it.ppmpItem?.department;
      const key = dept?.id ?? 'unassigned';
      const office = dept ? `${dept.code} — ${dept.name}` : 'Unassigned office';
      let g = map.get(key);
      if (!g) {
        g = { key, office, items: [], subtotal: 0 };
        map.set(key, g);
      }
      g.items.push(it);
      g.subtotal += parseFloat(it.approvedBudget) || 0;
    }
    return [...map.values()].sort((a, b) => a.office.localeCompare(b.office));
  }, [items]);

  const grandTotal = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.approvedBudget) || 0), 0),
    [items],
  );

  const fyLabel = fiscalYears.find((f) => f.id === selectedFiscalYear);

  return (
    <div className="pr-page">
      <Link to="/procurement" className="pr-back">
        {'<-'} Back to Procurement
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1>Annual Procurement Plan (APP)</h1>
        <button className="pr-btn" type="button" onClick={() => window.print()}>
          🖨 Print
        </button>
      </div>
      <p style={{ color: '#667085', fontSize: 14, marginBottom: 20 }}>
        The APP consolidates every end-user office's <strong>approved</strong> PPMP for the year.
        Use “Generate / Refresh” after approving PPMP items to pull them in.
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

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div className="pr-field" style={{ minWidth: 220 }}>
          <label>Fiscal Year</label>
          <select value={selectedFiscalYear} onChange={(e) => setSelectedFiscalYear(e.target.value)}>
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name} ({fy.year})
              </option>
            ))}
          </select>
        </div>
        <button
          className="pr-btn pr-btn--primary"
          type="button"
          onClick={handleConsolidate}
          disabled={consolidating || !selectedFiscalYear}
        >
          {consolidating ? 'Consolidating…' : '↻ Generate / Refresh from approved PPMPs'}
        </button>
        <button
          className="pr-btn"
          type="button"
          onClick={() => {
            setDirect(EMPTY_DIRECT);
            setShowDirect((v) => !v);
          }}
          disabled={!selectedFiscalYear}
          title="Add an item that is in the APP but not in any PPMP (e.g. a GenSet)"
        >
          ➕ Add item not in PPMP
        </button>
      </div>

      {showDirect && (
        <form
          onSubmit={handleAddDirect}
          style={{
            border: '1px solid #d0d5dd',
            borderRadius: 10,
            padding: 20,
            marginBottom: 20,
            background: '#fcfcfd',
          }}
        >
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--mswd-navy)' }}>
            Add APP item (not in any PPMP)
          </h3>
          <p style={{ margin: '0 0 16px', color: '#667085', fontSize: 13 }}>
            For items listed in the Annual Procurement Plan that did not come from an end-user PPMP
            (e.g. a Generator Set). It is added as an approved APP line and can be cited on a PR.
          </p>
          <div className="pr-form-grid">
            <div className="pr-field" style={{ gridColumn: '1 / -1' }}>
              <label>Procurement Project / Item *</label>
              <input
                value={direct.title}
                onChange={(e) => setDirect((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Generator Set (GenSet), 50 kVA"
              />
            </div>
            <div className="pr-field">
              <label>Category</label>
              <select
                value={direct.category}
                onChange={(e) => setDirect((d) => ({ ...d, category: e.target.value }))}
              >
                <option value="goods">Goods</option>
                <option value="services">Services</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="consulting_services">Consulting Services</option>
              </select>
            </div>
            <div className="pr-field">
              <label>Office / Department</label>
              <select
                value={direct.departmentId}
                onChange={(e) => setDirect((d) => ({ ...d, departmentId: e.target.value, endUserId: '' }))}
              >
                <option value="">— Unassigned —</option>
                {departments.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.code} — {dp.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pr-field">
              <label>End-User (optional)</label>
              <select
                value={direct.endUserId}
                onChange={(e) => setDirect((d) => ({ ...d, endUserId: e.target.value }))}
              >
                <option value="">— None —</option>
                {endUsers
                  .filter((u) => !direct.departmentId || u.departmentId === direct.departmentId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="pr-field">
              <label>Mode of Procurement</label>
              <input
                value={direct.procurementMode}
                onChange={(e) => setDirect((d) => ({ ...d, procurementMode: e.target.value }))}
                placeholder="e.g. Public Bidding"
              />
            </div>
            <div className="pr-field">
              <label>Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={direct.quantity}
                onChange={(e) => setDirect((d) => ({ ...d, quantity: e.target.value }))}
              />
            </div>
            <div className="pr-field">
              <label>Unit of Measure</label>
              <input
                value={direct.unitOfMeasure}
                onChange={(e) => setDirect((d) => ({ ...d, unitOfMeasure: e.target.value }))}
                placeholder="e.g. unit"
              />
            </div>
            <div className="pr-field">
              <label>Estimated Unit Cost</label>
              <input
                type="number"
                min="0"
                step="any"
                value={direct.estimatedUnitCost}
                onChange={(e) => setDirect((d) => ({ ...d, estimatedUnitCost: e.target.value }))}
              />
            </div>
            <div className="pr-field">
              <label>Schedule (Month)</label>
              <select
                value={direct.scheduleMonth}
                onChange={(e) => setDirect((d) => ({ ...d, scheduleMonth: e.target.value }))}
              >
                <option value="">—</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="pr-field">
              <label>Approved Budget (ABC)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={direct.approvedBudget}
                onChange={(e) => setDirect((d) => ({ ...d, approvedBudget: e.target.value }))}
                placeholder={directBudget ? `auto: ${directBudget}` : 'qty × unit cost, or enter'}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="pr-btn pr-btn--primary" type="submit" disabled={savingDirect}>
              {savingDirect ? 'Adding…' : 'Add to APP'}
            </button>
            <button className="pr-btn" type="button" onClick={() => setShowDirect(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: '#667085' }}>Loading…</p>}

      {!loading && items.length === 0 && (
        <div
          style={{
            border: '1px dashed #d0d5dd',
            borderRadius: 10,
            padding: 24,
            color: '#667085',
            textAlign: 'center',
          }}
        >
          No APP lines yet for {fyLabel ? `${fyLabel.name} (${fyLabel.year})` : 'this year'}. Approve
          the office PPMPs, then click “Generate / Refresh from approved PPMPs”.
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 8,
            }}
          >
            <span style={{ color: '#475467', fontSize: 13 }}>
              {items.length} line(s) · {groups.length} office(s)
            </span>
            <span style={{ fontSize: 15 }}>
              Grand Total: <strong>{formatPeso(grandTotal.toFixed(2))}</strong>
            </span>
          </div>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 24 }}>
              <h2
                style={{
                  fontSize: 15,
                  color: 'var(--mswd-navy)',
                  margin: '0 0 8px',
                  borderBottom: '2px solid #e4e7ec',
                  paddingBottom: 4,
                }}
              >
                {g.office}
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="pr-table">
                  <thead>
                    <tr>
                      <th>APP #</th>
                      <th>PPMP Code</th>
                      <th>Procurement Project / Item</th>
                      <th>Category</th>
                      <th>Mode</th>
                      <th style={{ textAlign: 'center' }}>Sched.</th>
                      <th style={{ textAlign: 'right' }}>Approved Budget</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <strong>{it.appNumber}</strong>
                        </td>
                        <td>
                          {it.ppmpItem?.code ?? (
                            <span
                              className="pr-badge"
                              style={{ background: '#fef0c7', color: '#b54708' }}
                              title="In the APP but not in any PPMP"
                            >
                              Not in PPMP
                            </span>
                          )}
                        </td>
                        <td>{it.procurementProjectTitle}</td>
                        <td>{CATEGORY_LABEL[it.procurementCategory] ?? it.procurementCategory}</td>
                        <td style={{ fontSize: 12 }}>{it.procurementMode ?? '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const q = it.ppmpItem?.scheduleQuarter ?? quarterOf(it.scheduleMonth);
                            return q ? `Q${q}` : '—';
                          })()}
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatPeso(it.approvedBudget)}</td>
                        <td>
                          <span className={`pr-badge pr-badge--${it.status}`}>{it.status}</span>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>
                        {g.office} subtotal
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {formatPeso(g.subtotal.toFixed(2))}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 16,
              fontSize: 16,
              borderTop: '2px solid var(--mswd-navy)',
              paddingTop: 10,
            }}
          >
            <span>
              Grand Total ({fyLabel ? fyLabel.year : ''}):{' '}
              <strong>{formatPeso(grandTotal.toFixed(2))}</strong>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
