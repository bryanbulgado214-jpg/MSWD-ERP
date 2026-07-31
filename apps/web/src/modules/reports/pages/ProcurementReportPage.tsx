import { useEffect, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';
import type { CategoryBreakdown, DepartmentProcurement, MonthlyProcurement, ProcurementSummary } from '../api';
import { getMonthlyProcurement, getProcurementByCategory, getProcurementByDepartment, getProcurementSummary } from '../api';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  endorsed: 'Endorsed',
  budget_certified: 'Budget Certified',
  approved: 'Approved',
  procurement_in_progress: 'In Progress',
  po_created: 'PO Created',
  for_delivery: 'For Delivery',
  delivered: 'Delivered',
  inspected: 'Inspected',
  completed: 'Completed',
  returned: 'Returned',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  voided: 'Voided',
};

export function ProcurementReportPage() {
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  const [byDept, setByDept] = useState<DepartmentProcurement[]>([]);
  const [byCat, setByCat] = useState<CategoryBreakdown[]>([]);
  const [monthly, setMonthly] = useState<MonthlyProcurement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProcurementSummary(),
      getProcurementByDepartment(),
      getProcurementByCategory(),
      getMonthlyProcurement(),
    ])
      .then(([s, d, c, m]) => {
        setSummary(s);
        setByDept(d);
        setByCat(c);
        setMonthly(m);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="reports-loading">Loading procurement report...</div>;
  if (!summary) return <div className="reports-empty">No data available.</div>;

  const maxMonthlyAmount = Math.max(...monthly.map((m) => Number(m.totalAmount)), 1);

  return (
    <>
      {/* Summary Cards */}
      <div className="reports-cards">
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#175cd3' }}>{summary.totalPRs}</p>
          <p className="reports-card__label">Total Purchase Requests</p>
          <p className="reports-card__sub">{formatPeso(summary.totalAmount)}</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#0369a1' }}>{summary.poCount}</p>
          <p className="reports-card__label">Purchase Orders</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#7c3aed' }}>{summary.cafCount}</p>
          <p className="reports-card__label">CAFs Issued</p>
        </div>
        <div className="reports-card">
          <p className="reports-card__value" style={{ color: '#059669' }}>{summary.orsCount}</p>
          <p className="reports-card__label">ORS Records</p>
        </div>
      </div>

      {/* PR Status Breakdown */}
      <h2>Purchase Requests by Status</h2>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
              <th style={{ textAlign: 'right' }}>Total Amount</th>
              <th style={{ width: '30%' }}>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {summary.byStatus
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <tr key={row.status}>
                  <td>
                    <span className={`reports-badge reports-badge--${row.status}`}>
                      {STATUS_LABELS[row.status] ?? row.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="num">{row.count}</td>
                  <td className="num">{formatPeso(row.totalAmount)}</td>
                  <td>
                    <div className="reports-bar">
                      <div
                        className="reports-bar__fill"
                        style={{ width: `${Math.max((row.count / summary.totalPRs) * 100, 1)}%` }}
                      />
                      <span className="reports-bar__label">
                        {((row.count / summary.totalPRs) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Monthly Trend */}
      {monthly.length > 0 && (
        <>
          <h2>Monthly Procurement Activity ({new Date().getFullYear()})</h2>
          <div className="reports-trend">
            {monthly.map((m) => {
              const pct = (Number(m.totalAmount) / maxMonthlyAmount) * 100;
              const monthLabel = new Date(m.month + '-01').toLocaleDateString('en-PH', { month: 'short' });
              return (
                <div key={m.month} className="reports-trend__bar">
                  <span className="reports-trend__value">{m.prCount}</span>
                  <div
                    className="reports-trend__fill"
                    style={{ height: `${Math.max(pct, 3)}%` }}
                  />
                  <span className="reports-trend__month">{monthLabel}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* By Department */}
      {byDept.length > 0 && (
        <>
          <h2>Procurement by Department</h2>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Department</th>
                  <th style={{ textAlign: 'right' }}>PRs</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Completed</th>
                  <th style={{ textAlign: 'right' }}>Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {byDept.map((d) => (
                  <tr key={d.departmentId}>
                    <td className="code">{d.departmentCode}</td>
                    <td>{d.departmentName}</td>
                    <td className="num">{d.prCount}</td>
                    <td className="num">{formatPeso(d.totalAmount)}</td>
                    <td className="num">{d.completedCount}</td>
                    <td className="num">{d.cancelledCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{byDept.reduce((s, d) => s + d.prCount, 0)}</td>
                  <td className="num">
                    {formatPeso(byDept.reduce((s, d) => s + Number(d.totalAmount), 0).toString())}
                  </td>
                  <td className="num">{byDept.reduce((s, d) => s + d.completedCount, 0)}</td>
                  <td className="num">{byDept.reduce((s, d) => s + d.cancelledCount, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* By Item Classification */}
      {byCat.length > 0 && (
        <>
          <h2>Items by Classification</h2>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Classification</th>
                  <th style={{ textAlign: 'right' }}>Item Count</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {byCat.map((c) => (
                  <tr key={c.classification}>
                    <td style={{ textTransform: 'capitalize' }}>{(c.classification ?? 'unclassified').replace(/_/g, ' ')}</td>
                    <td className="num">{c.itemCount}</td>
                    <td className="num">{formatPeso(c.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
