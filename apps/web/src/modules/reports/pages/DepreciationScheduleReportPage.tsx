import { useEffect, useState } from 'react';

import { getDepreciationSchedule } from '../../asset/api';
import type { DepreciationScheduleItem } from '../../asset/types';
import { formatPeso } from '../../budgeting/format-peso';

/** Depreciation Schedule — straight-line depreciation per depreciable asset. */
export function DepreciationScheduleReportPage() {
  const [rows, setRows] = useState<DepreciationScheduleItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDepreciationSchedule()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the schedule.'));
  }, []);

  const t = {
    cost: (rows ?? []).reduce((s, r) => s + r.acquisitionCost, 0),
    monthly: (rows ?? []).reduce((s, r) => s + r.monthlyDepreciation, 0),
    accum: (rows ?? []).reduce((s, r) => s + r.accumulatedDepreciation, 0),
    book: (rows ?? []).reduce((s, r) => s + r.bookValue, 0),
  };

  return (
    <div>
      <h2>Depreciation Schedule</h2>
      <p className="reports-subtitle">
        Straight-line depreciation for each depreciable asset — monthly charge, accumulated
        depreciation, net book value, and remaining life.
      </p>

      {error && <div className="reports-error">{error}</div>}
      {!rows && !error && <div className="reports-loading">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="reports-empty">No depreciable assets on record.</div>
      )}
      {rows && rows.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Property #</th>
                <th>Item</th>
                <th>Category</th>
                <th className="num">Acquisition Cost</th>
                <th className="num">Salvage</th>
                <th className="num">Useful Life (yrs)</th>
                <th className="num">Monthly Depr.</th>
                <th className="num">Accum. Depr.</th>
                <th className="num">Net Book Value</th>
                <th className="num">Remaining Life (mo)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.propertyNumber}</td>
                  <td>{r.itemName}</td>
                  <td>{r.category}</td>
                  <td className="num">{formatPeso(r.acquisitionCost)}</td>
                  <td className="num">{formatPeso(r.salvageValue)}</td>
                  <td className="num">{r.estimatedUsefulLife ?? '—'}</td>
                  <td className="num">{formatPeso(r.monthlyDepreciation)}</td>
                  <td className="num">{formatPeso(r.accumulatedDepreciation)}</td>
                  <td className="num">{formatPeso(r.bookValue)}</td>
                  <td className="num">{r.remainingLife ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  Total · {rows.length} {rows.length === 1 ? 'asset' : 'assets'}
                </td>
                <td className="num">{formatPeso(t.cost)}</td>
                <td colSpan={2} />
                <td className="num">{formatPeso(t.monthly)}</td>
                <td className="num">{formatPeso(t.accum)}</td>
                <td className="num">{formatPeso(t.book)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
