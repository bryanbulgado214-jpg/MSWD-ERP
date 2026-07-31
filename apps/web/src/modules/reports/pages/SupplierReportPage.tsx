import { useEffect, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';
import type { SupplierActivity } from '../api';
import { getSupplierActivity } from '../api';

export function SupplierReportPage() {
  const [suppliers, setSuppliers] = useState<SupplierActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSupplierActivity()
      .then(setSuppliers)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="reports-loading">Loading supplier activity...</div>;
  if (suppliers.length === 0) return <div className="reports-empty">No supplier data available.</div>;

  const totalPOs = suppliers.reduce((s, r) => s + r.poCount, 0);
  const totalContract = suppliers.reduce((s, r) => s + Number(r.totalContract), 0);
  const maxContract = Math.max(...suppliers.map((s) => Number(s.totalContract)), 1);

  return (
    <>
      <div className="reports-cards">
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#175cd3' }}>{suppliers.length}</p>
          <p className="reports-card__label">Active Suppliers</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#0369a1' }}>{totalPOs}</p>
          <p className="reports-card__label">Total POs Issued</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#059669', fontSize: 22 }}>
            {formatPeso(totalContract.toString())}
          </p>
          <p className="reports-card__label">Total Contract Value</p>
        </div>
      </div>

      <h2>Supplier Activity</h2>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>TIN</th>
              <th style={{ textAlign: 'right' }}>POs</th>
              <th style={{ textAlign: 'right' }}>Approved POs</th>
              <th style={{ textAlign: 'right' }}>Total Contract</th>
              <th style={{ width: '20%' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.supplierId}>
                <td>{s.supplierName}</td>
                <td className="code">{s.supplierTin ?? '—'}</td>
                <td className="num">{s.poCount}</td>
                <td className="num">{s.approvedPOs}</td>
                <td className="num">{formatPeso(s.totalContract)}</td>
                <td>
                  <div className="reports-bar">
                    <div
                      className="reports-bar__fill"
                      style={{ width: `${(Number(s.totalContract) / maxContract) * 100}%` }}
                    />
                    <span className="reports-bar__label">
                      {totalContract > 0
                        ? ((Number(s.totalContract) / totalContract) * 100).toFixed(1) + '%'
                        : '—'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num">{totalPOs}</td>
              <td className="num">{suppliers.reduce((s, r) => s + r.approvedPOs, 0)}</td>
              <td className="num">{formatPeso(totalContract.toString())}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
