import { useEffect, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';
import {
  getFiscalYears,
  getPpmpUtilization,
  type FiscalYearOption,
  type PpmpUtilizationRow,
} from '../api';

function qty(v: string): string {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '—';
}

export function PpmpUtilizationReportPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [fyId, setFyId] = useState('');
  const [rows, setRows] = useState<PpmpUtilizationRow[]>([]);
  const [loading, setLoading] = useState(true);

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
    getPpmpUtilization(fyId || undefined)
      .then((r) => {
        if (!cancelled) setRows(r.rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fyId]);

  const totals = rows.reduce(
    (a, r) => ({
      approvedBudget: a.approvedBudget + Number(r.approvedBudget),
      purchasedAmount: a.purchasedAmount + Number(r.purchasedAmount),
      remainingBudget: a.remainingBudget + Number(r.remainingBudget),
    }),
    { approvedBudget: 0, purchasedAmount: 0, remainingBudget: 0 },
  );

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
      </div>

      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 12px' }}>
        Approved PPMP items with what has actually been placed on a Purchase Order and the quantity
        still to be purchased. "Purchased" counts non-cancelled POs raised against each item.
      </p>

      {loading ? (
        <div className="reports-loading">Loading PPMP utilization…</div>
      ) : rows.length === 0 ? (
        <div className="reports-empty">No approved PPMP items for this fiscal year.</div>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Section</th>
                <th>End-User</th>
                <th>UOM</th>
                <th style={{ textAlign: 'right' }}>Approved Qty</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                <th style={{ textAlign: 'right' }}>Approved Budget</th>
                <th style={{ textAlign: 'right' }}>Purchased Qty</th>
                <th style={{ textAlign: 'right' }}>Purchased Amount</th>
                <th>PO Reference</th>
                <th style={{ textAlign: 'right' }}>Remaining Qty</th>
                <th style={{ textAlign: 'right' }}>Remaining Budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.code}-${i}`}>
                  <td className="code">{r.code}</td>
                  <td>{r.description}</td>
                  <td>{r.section}</td>
                  <td>{r.endUser || '—'}</td>
                  <td>{r.unitOfMeasure}</td>
                  <td className="num">{qty(r.approvedQty)}</td>
                  <td className="num">{formatPeso(r.unitCost)}</td>
                  <td className="num">{formatPeso(r.approvedBudget)}</td>
                  <td className="num">{qty(r.purchasedQty)}</td>
                  <td className="num">{formatPeso(r.purchasedAmount)}</td>
                  <td>{r.poReferences || '—'}</td>
                  <td className="num">{qty(r.remainingQty)}</td>
                  <td className="num">{formatPeso(r.remainingBudget)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Total</td>
                <td className="num">{formatPeso(totals.approvedBudget.toString())}</td>
                <td />
                <td className="num">{formatPeso(totals.purchasedAmount.toString())}</td>
                <td colSpan={2} />
                <td className="num">{formatPeso(totals.remainingBudget.toString())}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
