import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getDepreciationSchedule, getCategories } from '../api';
import type { DepreciationScheduleItem, AssetCategory } from '../types';

import AssetSubNav from './AssetSubNav';
import '../asset.css';

function formatCurrency(val: number) {
  return val.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function AssetReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('categoryId') ?? '';

  const [items, setItems] = useState<DepreciationScheduleItem[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getDepreciationSchedule(categoryFilter || undefined)
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [categoryFilter]);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  function setFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set('categoryId', value);
      } else {
        next.delete('categoryId');
      }
      return next;
    });
  }

  const totalAcquisition = items.reduce((s, i) => s + i.acquisitionCost, 0);
  const totalAccumDepr = items.reduce((s, i) => s + i.accumulatedDepreciation, 0);
  const totalBookValue = items.reduce((s, i) => s + i.bookValue, 0);

  return (
    <div className="am-page">
      <AssetSubNav />
      <div className="am-page__header">
        <h1>Depreciation Schedule Report</h1>
      </div>

      {error && <div className="am-error">{error}</div>}

      <div className="am-filters">
        <select
          className="am-select"
          value={categoryFilter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.code} — {cat.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="am-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="am-empty">No depreciation schedule data found.</div>
      ) : (
        <>
          <div className="am-dash-cards" style={{ marginBottom: '1rem' }}>
            <div className="am-dash-card">
              <div className="am-dash-card__value">{items.length}</div>
              <div className="am-dash-card__label">Assets</div>
            </div>
            <div className="am-dash-card">
              <div className="am-dash-card__value">{formatCurrency(totalAcquisition)}</div>
              <div className="am-dash-card__label">Total Cost</div>
            </div>
            <div className="am-dash-card">
              <div className="am-dash-card__value">{formatCurrency(totalAccumDepr)}</div>
              <div className="am-dash-card__label">Accum Depreciation</div>
            </div>
            <div className="am-dash-card">
              <div className="am-dash-card__value">{formatCurrency(totalBookValue)}</div>
              <div className="am-dash-card__label">Total Book Value</div>
            </div>
          </div>

          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr>
                  <th>Property #</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Acquisition Cost</th>
                  <th style={{ textAlign: 'right' }}>Salvage Value</th>
                  <th style={{ textAlign: 'right' }}>Monthly Depr</th>
                  <th style={{ textAlign: 'right' }}>Accum Depr</th>
                  <th style={{ textAlign: 'right' }}>Book Value</th>
                  <th style={{ textAlign: 'right' }}>Remaining Life (mo)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ cursor: 'default' }}>
                    <td>{item.propertyNumber}</td>
                    <td>{item.description}</td>
                    <td>{item.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.acquisitionCost)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.salvageValue)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatCurrency(item.monthlyDepreciation)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {formatCurrency(item.accumulatedDepreciation)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.bookValue)}</td>
                    <td style={{ textAlign: 'right' }}>{item.remainingLife ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600 }}>
                  <td colSpan={3}>Totals</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalAcquisition)}</td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalAccumDepr)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalBookValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
