import { useEffect, useState } from 'react';

import { getDepreciationSchedule } from '../../asset/api';
import type { DepreciationScheduleItem } from '../../asset/types';
import { formatPeso } from '../../budgeting/format-peso';

export function FixedAssetLapsingReportPage() {
  const [items, setItems] = useState<DepreciationScheduleItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDepreciationSchedule()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, []);

  if (error) return <div className="reports-error">{error}</div>;
  if (!items) return <div className="reports-loading">Loading…</div>;

  const totals = items.reduce(
    (t, i) => ({
      cost: t.cost + i.acquisitionCost,
      accum: t.accum + i.accumulatedDepreciation,
      book: t.book + i.bookValue,
    }),
    { cost: 0, accum: 0, book: 0 },
  );

  return (
    <div>
      <h2>Fixed Asset Lapsing Schedule</h2>
      <p className="reports-subtitle">
        Property, plant &amp; equipment with cost, accumulated depreciation, and net book value.
      </p>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Property #</th>
              <th>Item</th>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Acquisition Cost</th>
              <th style={{ textAlign: 'right' }}>Monthly Depr</th>
              <th style={{ textAlign: 'right' }}>Accum. Depr</th>
              <th style={{ textAlign: 'right' }}>Net Book Value</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="reports-loading">
                  No depreciable fixed assets found.
                </td>
              </tr>
            )}
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ fontFamily: 'monospace' }}>{i.propertyNumber}</td>
                <td>{i.itemName || i.description}</td>
                <td>{i.category}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(i.acquisitionCost)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(i.monthlyDepreciation)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(i.accumulatedDepreciation)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(i.bookValue)}
                </td>
              </tr>
            ))}
            {items.length > 0 && (
              <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
                <td colSpan={3}>Total</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(totals.cost)}
                </td>
                <td></td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(totals.accum)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(totals.book)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
