import { useEffect, useMemo, useState } from 'react';

import { getAssetRegisterReport } from '../../asset/api';
import type { AssetRegisterItem } from '../../asset/types';
import { formatPeso } from '../../budgeting/format-peso';

/** Fixed Asset Register — the master list of property, plant & equipment. */
export function FixedAssetRegisterPage() {
  const [rows, setRows] = useState<AssetRegisterItem[] | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    getAssetRegisterReport()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the register.'));
  }, []);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    rows?.forEach(
      (r) =>
        r.assetCategory &&
        m.set(r.assetCategory.id, `${r.assetCategory.code} — ${r.assetCategory.name}`),
    );
    return [...m.entries()];
  }, [rows]);

  const filtered = (rows ?? []).filter(
    (r) => category === 'all' || r.assetCategory?.id === category,
  );
  const totalCost = filtered.reduce((s, r) => s + Number(r.acquisitionCost), 0);
  const totalBook = filtered.reduce((s, r) => s + Number(r.bookValue ?? 0), 0);

  return (
    <div>
      <h2>Fixed Asset Register</h2>
      <p className="reports-subtitle">
        Property, plant &amp; equipment on record, with acquisition cost and net book value.
      </p>

      <div className="reports-filters">
        <label htmlFor="far-cat">Category</label>
        <select id="far-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!rows && !error && <div className="reports-loading">Loading…</div>}
      {rows && filtered.length === 0 && (
        <div className="reports-empty">No fixed assets on record.</div>
      )}
      {rows && filtered.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Property #</th>
                <th>Item</th>
                <th>Category</th>
                <th>Date Acquired</th>
                <th className="num">Acquisition Cost</th>
                <th className="num">Accum. Depr.</th>
                <th className="num">Net Book Value</th>
                <th>Condition</th>
                <th>Accountable</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.propertyNumber}</td>
                  <td>{r.inventoryItem?.description ?? r.description}</td>
                  <td>
                    {r.assetCategory ? `${r.assetCategory.code} — ${r.assetCategory.name}` : '—'}
                  </td>
                  <td>{new Date(r.dateAcquired).toLocaleDateString('en-PH')}</td>
                  <td className="num">{formatPeso(r.acquisitionCost)}</td>
                  <td className="num">{formatPeso(r.accumulatedDepreciation)}</td>
                  <td className="num">{formatPeso(r.bookValue ?? 0)}</td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {r.condition.replace(/_/g, ' ')}
                    {r.isDisposed ? ' (disposed)' : ''}
                  </td>
                  <td>{r.accountableUser?.username ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  Total · {filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}
                </td>
                <td className="num">{formatPeso(totalCost)}</td>
                <td />
                <td className="num">{formatPeso(totalBook)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
