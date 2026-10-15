import { useEffect, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';
import {
  getAppUtilization,
  getFiscalYears,
  type AppUtilizationRow,
  type FiscalYearOption,
  type OffAppRow,
} from '../api';

function qty(v: string): string {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '—';
}

export function AppUtilizationReportPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [fyId, setFyId] = useState('');
  const [rows, setRows] = useState<AppUtilizationRow[]>([]);
  const [offAppRows, setOffAppRows] = useState<OffAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getFiscalYears()
      .then((fys) => {
        setFiscalYears(fys);
        if (fys[0]) setFyId(fys[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAppUtilization(fyId || undefined)
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setOffAppRows(r.offAppRows ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fyId]);

  const q = search.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter((r) =>
        [r.appNumber, r.projectTitle, r.section, r.endUser, r.poReferences].some((v) =>
          (v ?? '').toLowerCase().includes(q),
        ),
      )
    : rows;
  const filteredOffApp = q
    ? offAppRows.filter((r) =>
        [r.prNumber, r.description, r.section, r.endUser, r.poReferences].some((v) =>
          (v ?? '').toLowerCase().includes(q),
        ),
      )
    : offAppRows;

  // A planned APP line is "not yet purchased" (waivable / realignable) when no
  // quantity has been bought against it.
  const isUnpurchased = (r: AppUtilizationRow) => Number(r.purchasedQty) === 0;

  const totals = filteredRows.reduce(
    (a, r) => ({
      approvedBudget: a.approvedBudget + Number(r.approvedBudget),
      purchasedAmount: a.purchasedAmount + Number(r.purchasedAmount),
      remainingBudget: a.remainingBudget + Number(r.remainingBudget),
      overUnder: a.overUnder + Number(r.overUnder),
    }),
    { approvedBudget: 0, purchasedAmount: 0, remainingBudget: 0, overUnder: 0 },
  );

  // Realignment view: budget sitting in not-yet-purchased plan lines (can be
  // waived) vs. the cost of off-APP purchases that need funding.
  const waivable = rows.filter(isUnpurchased);
  const waivableTotal = waivable.reduce((s, r) => s + Number(r.approvedBudget), 0);
  const offAppTotal = offAppRows.reduce((s, r) => s + Number(r.actualAmount), 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#344054' }}>Fiscal Year</label>
        <select
          value={fyId}
          onChange={(e) => setFyId(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d0d5dd', borderRadius: 6, fontSize: 13 }}
        >
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.name} ({fy.year})
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search APP no., project, section, end-user…"
          style={{
            flex: 1,
            maxWidth: 360,
            padding: '6px 10px',
            border: '1px solid #d0d5dd',
            borderRadius: 6,
            fontSize: 13,
          }}
        />
      </div>

      {/* Realignment view — waivable (unpurchased) plan budget vs. off-APP need. */}
      {!loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '0 0 16px' }}>
          <div
            style={{
              flex: '1 1 260px',
              background: '#fffaeb',
              border: '1px solid #fedf89',
              borderRadius: 10,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#b54708' }}>
              Not yet purchased — waivable / realignable
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#b54708', margin: '2px 0' }}>
              {formatPeso(waivableTotal.toString())}
            </div>
            <div style={{ fontSize: 12, color: '#667085' }}>
              {waivable.length} planned APP item{waivable.length === 1 ? '' : 's'} with nothing
              purchased yet
            </div>
          </div>
          <div
            style={{
              flex: '1 1 260px',
              background: '#eff8ff',
              border: '1px solid #b2ddff',
              borderRadius: 10,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#175cd3' }}>
              Off-APP purchases — needs realignment
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#175cd3', margin: '2px 0' }}>
              {formatPeso(offAppTotal.toString())}
            </div>
            <div style={{ fontSize: 12, color: '#667085' }}>
              {offAppRows.length} purchased item{offAppRows.length === 1 ? '' : 's'} not in the APP
            </div>
          </div>
        </div>
      )}

      <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--mswd-navy)' }}>
        APP Items — Planned vs. Purchased
      </h3>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 12px' }}>
        Consolidated Annual Procurement Plan lines with actual purchases placed on Purchase Orders
        and the remaining budget. Rows shaded amber have nothing purchased yet — candidates to waive
        and realign to the off-APP items below.
      </p>

      {loading ? (
        <div className="reports-loading">Loading APP utilization…</div>
      ) : filteredRows.length === 0 ? (
        <div className="reports-empty">
          {q ? `No items match "${search}".` : 'No approved APP items for this fiscal year.'}
        </div>
      ) : (
        <div className="reports-table-wrap reports-table-wrap--sticky">
          <table className="reports-table">
            <thead>
              <tr>
                <th>APP No.</th>
                <th>Project / Item</th>
                <th>Section</th>
                <th>End-User</th>
                <th>UOM</th>
                <th style={{ textAlign: 'right' }}>Approved Qty</th>
                <th style={{ textAlign: 'right' }}>Approved Budget</th>
                <th style={{ textAlign: 'right' }}>Purchased Qty</th>
                <th style={{ textAlign: 'right' }}>Purchased Amount</th>
                <th>PO Reference</th>
                <th style={{ textAlign: 'right' }}>Remaining Qty</th>
                <th style={{ textAlign: 'right' }}>Remaining Budget</th>
                <th style={{ textAlign: 'right' }}>Over/Under Utilization</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => {
                const waivableRow = isUnpurchased(r);
                return (
                  <tr
                    key={`${r.appNumber}-${i}`}
                    style={waivableRow ? { background: '#fffaeb' } : undefined}
                    title={
                      waivableRow
                        ? 'Not yet purchased — can be waived and realigned'
                        : undefined
                    }
                  >
                    <td className="code">{r.appNumber}</td>
                    <td>
                      {r.projectTitle}
                      {r.notInPpmp && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: '#fef0c7',
                            color: '#b54708',
                            whiteSpace: 'nowrap',
                          }}
                          title="In the APP but not in any PPMP"
                        >
                          Not in PPMP
                        </span>
                      )}
                    </td>
                    <td>{r.section || '—'}</td>
                    <td>{r.endUser || '—'}</td>
                    <td>{r.unitOfMeasure}</td>
                    <td className="num">{qty(r.approvedQty)}</td>
                    <td className="num">{formatPeso(r.approvedBudget)}</td>
                    <td className="num">{qty(r.purchasedQty)}</td>
                    <td className="num">{formatPeso(r.purchasedAmount)}</td>
                    <td>{r.poReferences || '—'}</td>
                    <td className="num">{qty(r.remainingQty)}</td>
                    <td className="num">{formatPeso(r.remainingBudget)}</td>
                    <td
                      className="num"
                      style={{ color: Number(r.overUnder) < 0 ? '#b42318' : '#067647' }}
                    >
                      {formatPeso(r.overUnder)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Total</td>
                <td className="num">{formatPeso(totals.approvedBudget.toString())}</td>
                <td />
                <td className="num">{formatPeso(totals.purchasedAmount.toString())}</td>
                <td colSpan={2} />
                <td className="num">{formatPeso(totals.remainingBudget.toString())}</td>
                <td className="num" style={{ color: totals.overUnder < 0 ? '#b42318' : '#067647' }}>
                  {formatPeso(totals.overUnder.toString())}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Off-APP purchases (not in the plan) ── */}
      {!loading && (
        <>
          <h3 style={{ margin: '24px 0 6px', fontSize: 15, color: 'var(--mswd-navy)' }}>
            Off-APP Purchases — Not in the Annual Procurement Plan
          </h3>
          <p style={{ color: '#667085', fontSize: 13, margin: '0 0 12px' }}>
            Catch-up purchase-request lines flagged "Not in APP" that reached a Purchase Order. These
            need budget realigned to them — pair their actual cost against the waivable (not-yet-purchased)
            APP items above.
          </p>
          {filteredOffApp.length === 0 ? (
            <div className="reports-empty">
              {q
                ? `No off-APP items match "${search}".`
                : 'No off-APP purchases flagged for this fiscal year.'}
            </div>
          ) : (
            <div className="reports-table-wrap reports-table-wrap--sticky">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>PR No.</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Section</th>
                    <th>End-User</th>
                    <th>UOM</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Estimated Amount</th>
                    <th style={{ textAlign: 'right' }}>Actual Amount</th>
                    <th>PO Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOffApp.map((r, i) => (
                    <tr key={`${r.prNumber}-${i}`}>
                      <td className="code">{r.prNumber}</td>
                      <td>{r.date}</td>
                      <td>{r.description}</td>
                      <td>{r.section || '—'}</td>
                      <td>{r.endUser || '—'}</td>
                      <td>{r.unitOfMeasure}</td>
                      <td className="num">{qty(r.quantity)}</td>
                      <td className="num">{formatPeso(r.unitCost)}</td>
                      <td className="num">{formatPeso(r.estimatedAmount)}</td>
                      <td className="num">{formatPeso(r.actualAmount)}</td>
                      <td>{r.poReferences || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8}>Total</td>
                    <td className="num">
                      {formatPeso(
                        filteredOffApp
                          .reduce((s, r) => s + Number(r.estimatedAmount), 0)
                          .toString(),
                      )}
                    </td>
                    <td className="num">
                      {formatPeso(
                        filteredOffApp.reduce((s, r) => s + Number(r.actualAmount), 0).toString(),
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
