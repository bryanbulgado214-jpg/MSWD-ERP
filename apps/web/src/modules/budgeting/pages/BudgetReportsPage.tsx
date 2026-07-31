import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  BudgetSummaryApiError,
  getBudgetHeaderSummary,
  listBudgetHeaders,
} from '../api';
import { formatPeso } from '../format-peso';
import type {
  BudgetAmountSummary,
  BudgetHeaderListItem,
} from '../types';
import './budget-detail.css';

type ReportType =
  | 'annual-summary'
  | 'by-department'
  | 'by-fund'
  | 'utilization'
  | 'availability';

interface BudgetRow {
  header: BudgetHeaderListItem;
  summary: BudgetAmountSummary;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; rows: BudgetRow[] };

export function BudgetReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('annual-summary');
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  async function runReport() {
    setState({ status: 'loading' });
    try {
      const result = await listBudgetHeaders({
        status: 'approved',
        pageSize: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      const rows: BudgetRow[] = [];
      for (const header of result.data) {
        try {
          const summary = await getBudgetHeaderSummary(header.id);
          rows.push({ header, summary });
        } catch {
          // skip headers where summary fails
        }
      }
      setState({ status: 'loaded', rows });
    } catch (err) {
      setState({ status: 'error', message: err instanceof BudgetSummaryApiError ? err.message : 'Failed to load report data.' });
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleExportCsv() {
    if (state.status !== 'loaded') return;
    const headers = ['Department', 'Fund Source', 'Approved', 'Released', 'Reserved', 'Obligated', 'Available', 'Utilization %'];
    const csvRows = [headers.join(',')];
    for (const row of state.rows) {
      const util = parseFloat(row.summary.releasedAmount) > 0
        ? ((parseFloat(row.summary.obligatedAmount) / parseFloat(row.summary.releasedAmount)) * 100).toFixed(1)
        : '0.0';
      csvRows.push([
        `"${row.header.responsibilityCenter.name}"`,
        `"${row.header.fundSource.name}"`,
        row.summary.approvedAmount,
        row.summary.releasedAmount,
        row.summary.reservedAmount,
        row.summary.obligatedAmount,
        row.summary.availableAmount,
        util,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-report-${reportType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="budget-detail">
      <Link className="budget-detail__back" to="/budgeting">← Back to Budgets</Link>
      <h1 className="budget-detail__heading">Budget Reports</h1>
      <p className="budget-detail__subheading">Generate and view budget reports across approved budgets.</p>

      <section className="budget-detail__section">
        <div className="budget-detail__section-header">Report Settings</div>
        <div className="budget-detail__section-body">
          <label className="budget-detail__field">
            <span>Report Type</span>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
              <option value="annual-summary">Annual Budget Summary</option>
              <option value="by-department">Budget by Department</option>
              <option value="by-fund">Budget by Fund Source</option>
              <option value="utilization">Budget Utilization Report</option>
              <option value="availability">Budget Availability Report</option>
            </select>
          </label>

          <div className="budget-detail__action-row" style={{ marginTop: '1rem' }}>
            <button type="button" className="budget-detail__action-button budget-detail__action-button--primary" onClick={runReport} disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>
      </section>

      {state.status === 'error' && <p className="budget-detail__status budget-detail__status--error">{state.message}</p>}

      {state.status === 'loaded' && (
        <section className="budget-detail__section">
          <div className="budget-detail__section-header budget-detail__section-header--with-action">
            <span>{reportLabel(reportType)} ({state.rows.length} budgets)</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="budget-detail__add-button" onClick={handleExportCsv}>Export CSV</button>
              <button type="button" className="budget-detail__add-button" onClick={handlePrint}>Print</button>
            </div>
          </div>

          {state.rows.length === 0 ? (
            <p className="budget-detail__empty">No approved budgets found.</p>
          ) : (
            <ReportTable rows={state.rows} reportType={reportType} />
          )}
        </section>
      )}
    </div>
  );
}

function reportLabel(type: ReportType): string {
  switch (type) {
    case 'annual-summary': return 'Annual Budget Summary';
    case 'by-department': return 'Budget by Department';
    case 'by-fund': return 'Budget by Fund Source';
    case 'utilization': return 'Budget Utilization Report';
    case 'availability': return 'Budget Availability Report';
  }
}

function ReportTable({ rows, reportType }: { rows: BudgetRow[]; reportType: ReportType }) {
  return (
    <div className="budget-detail__table-wrap">
      <table className="budget-detail__table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Fund Source</th>
            <th>Approved</th>
            <th>Released</th>
            {(reportType === 'utilization' || reportType === 'annual-summary') && <th>Obligated</th>}
            {(reportType === 'availability' || reportType === 'annual-summary') && <th>Available</th>}
            {reportType === 'utilization' && <th>Utilization %</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const util = parseFloat(row.summary.releasedAmount) > 0
              ? ((parseFloat(row.summary.obligatedAmount) / parseFloat(row.summary.releasedAmount)) * 100).toFixed(1)
              : '0.0';
            return (
              <tr key={row.header.id}>
                <td>
                  <Link to={`/budgeting/budget-headers/${row.header.id}`} className="budget-detail__row-link">
                    {row.header.responsibilityCenter.name}
                  </Link>
                </td>
                <td>{row.header.fundSource.name}</td>
                <td className="budget-detail__amount">{formatPeso(row.summary.approvedAmount)}</td>
                <td className="budget-detail__amount">{formatPeso(row.summary.releasedAmount)}</td>
                {(reportType === 'utilization' || reportType === 'annual-summary') && (
                  <td className="budget-detail__amount">{formatPeso(row.summary.obligatedAmount)}</td>
                )}
                {(reportType === 'availability' || reportType === 'annual-summary') && (
                  <td className="budget-detail__amount">{formatPeso(row.summary.availableAmount)}</td>
                )}
                {reportType === 'utilization' && <td>{util}%</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
