import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getAssetRegister, getCategories } from '../api';
import type { AssetRegisterItem, AssetCategory } from '../types';

import AssetSubNav from './AssetSubNav';
import '../asset.css';

function formatCurrency(val: string | number | null | undefined) {
  if (val == null) return '—';
  return Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function AssetRegisterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('categoryId') ?? '';
  const disposedFilter = searchParams.get('isDisposed') ?? '';

  const [items, setItems] = useState<AssetRegisterItem[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadRegister() {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
      ...(disposedFilter ? { isDisposed: disposedFilter } : {}),
    });
    getAssetRegister(params.toString())
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRegister();
  }, [categoryFilter, disposedFilter]);
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  function setFilter(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  return (
    <div className="am-page">
      <AssetSubNav />
      <div className="am-page__header">
        <h1>Asset Register</h1>
      </div>

      {error && <div className="am-error">{error}</div>}

      <div className="am-filters">
        <select
          className="am-select"
          value={categoryFilter}
          onChange={(e) => setFilter('categoryId', e.target.value)}
          style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.code} — {cat.name}
            </option>
          ))}
        </select>
        <select
          className="am-select"
          value={disposedFilter}
          onChange={(e) => setFilter('isDisposed', e.target.value)}
        >
          <option value="">Active &amp; Disposed</option>
          <option value="false">Active Only</option>
          <option value="true">Disposed Only</option>
        </select>
      </div>

      {loading ? (
        <div className="am-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="am-empty">No asset records found.</div>
      ) : (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead>
              <tr>
                <th>Property #</th>
                <th>Item Name</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Acquisition Cost</th>
                <th style={{ textAlign: 'right' }}>Salvage Value</th>
                <th style={{ textAlign: 'right' }}>Monthly Depr</th>
                <th style={{ textAlign: 'right' }}>Accum Depr</th>
                <th style={{ textAlign: 'right' }}>Book Value</th>
                <th>Condition</th>
                <th>Location</th>
                <th>Accountable To</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ cursor: 'default' }}>
                  <td>{item.propertyNumber}</td>
                  <td>{item.inventoryItem.description}</td>
                  <td>{item.assetCategory?.name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.acquisitionCost)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.salvageValue)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.monthlyDepreciation)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {formatCurrency(item.accumulatedDepreciation)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.bookValue)}</td>
                  <td>{item.condition}</td>
                  <td>{item.location?.name ?? '—'}</td>
                  <td>{item.accountableUser?.username ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
