import { useEffect, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';
import type { BudgetUtilization, FiscalYearOption } from '../api';
import { getBudgetUtilization, getFiscalYears } from '../api';

export function BudgetReportPage() {
  const [rows, setRows] = useState<BudgetUtilization[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFiscalYears().then(setFiscalYears);
  }, []);

  useEffect(() => {
    setLoading(true);
    getBudgetUtilization(selectedFY || undefined)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [selectedFY]);

  if (loading) return <div className="reports-loading">Loading budget utilization...</div>;

  const totals = rows.reduce(
    (acc, r) => ({
      approved: acc.approved + Number(r.approvedAmount),
      released: acc.released + Number(r.releasedAmount),
      reserved: acc.reserved + Number(r.reservedAmount),
      available: acc.available + Number(r.availableAmount),
    }),
    { approved: 0, released: 0, reserved: 0, available: 0 },
  );

  return (
    <>
      <div className="reports-filters">
        <label htmlFor="fy-filter">Fiscal Year:</label>
        <select
          id="fy-filter"
          value={selectedFY}
          onChange={(e) => setSelectedFY(e.target.value)}
        >
          <option value="">All Years</option>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>{fy.name}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="reports-cards">
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#175cd3', fontSize: 22 }}>
            {formatPeso(totals.approved.toString())}
          </p>
          <p className="reports-card__label">Total Approved Budget</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#0369a1', fontSize: 22 }}>
            {formatPeso(totals.released.toString())}
          </p>
          <p className="reports-card__label">Total Released</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#f59e0b', fontSize: 22 }}>
            {formatPeso(totals.reserved.toString())}
          </p>
          <p className="reports-card__label">Total Reserved</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#22c55e', fontSize: 22 }}>
            {formatPeso(totals.available.toString())}
          </p>
          <p className="reports-card__label">Total Available</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="reports-empty">No approved budget data found.</div>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Responsibility Center</th>
                <th>Fund Source</th>
                <th style={{ textAlign: 'right' }}>Approved</th>
                <th style={{ textAlign: 'right' }}>Released</th>
                <th style={{ textAlign: 'right' }}>Reserved</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th style={{ width: '15%' }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const released = Number(r.releasedAmount);
                const reserved = Number(r.reservedAmount);
                const utilPct = released > 0 ? (reserved / released) * 100 : 0;
                const availPct = released > 0 ? (Number(r.availableAmount) / released) * 100 : 0;
                return (
                  <tr key={i}>
                    <td>
                      <span className="code">{r.rcCode}</span> {r.rcName}
                    </td>
                    <td>
                      <span className="code">{r.fsCode}</span> {r.fsName}
                    </td>
                    <td className="num">{formatPeso(r.approvedAmount)}</td>
                    <td className="num">{formatPeso(r.releasedAmount)}</td>
                    <td className="num">{formatPeso(r.reservedAmount)}</td>
                    <td className="num">{formatPeso(r.availableAmount)}</td>
                    <td>
                      <div className="reports-util-bar">
                        <div
                          className="reports-util-bar__segment reports-util-bar__segment--reserved"
                          style={{ width: `${Math.min(utilPct, 100)}%` }}
                        />
                        <div
                          className="reports-util-bar__segment reports-util-bar__segment--available"
                          style={{ width: `${Math.min(availPct, 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Totals</td>
                <td className="num">{formatPeso(totals.approved.toString())}</td>
                <td className="num">{formatPeso(totals.released.toString())}</td>
                <td className="num">{formatPeso(totals.reserved.toString())}</td>
                <td className="num">{formatPeso(totals.available.toString())}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
