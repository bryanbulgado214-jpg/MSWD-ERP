import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Complaint, ComplaintType, ComplaintPriority, ComplaintStatus } from '../types';
import { COMPLAINT_TYPE_LABELS, COMPLAINT_PRIORITY_LABELS, COMPLAINT_STATUS_LABELS } from '../types';
import { getReport } from '../api';
import '../complaints.css';

interface ReportData {
  complaints: Complaint[];
  summary: { totalCount: number; resolvedCount: number; avgResolutionHrs: number | null };
}

export default function ComplaintReportsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (status) params.set('status', status);
    if (type) params.set('type', type);

    const qs = params.toString();

    setLoading(true);
    setError(null);
    getReport(qs || undefined)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to generate report');
        setLoading(false);
      });
  };

  return (
    <div className="cs-page">
      <div className="cs-page__header">
        <h1>Complaint Reports</h1>
        <div className="cs-page__actions">
          <Link to="/complaints" className="cs-btn">
            &larr; Back to List
          </Link>
        </div>
      </div>

      <div className="cs-filters">
        <input
          type="date"
          className="cs-input"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="Date From"
        />
        <input
          type="date"
          className="cs-input"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="Date To"
        />
        <select
          className="cs-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          {(Object.entries(COMPLAINT_STATUS_LABELS) as Array<[ComplaintStatus, string]>).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
        <select
          className="cs-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All Types</option>
          {(Object.entries(COMPLAINT_TYPE_LABELS) as Array<[ComplaintType, string]>).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
        <button className="cs-btn cs-btn--primary" onClick={handleGenerate}>
          Generate Report
        </button>
      </div>

      {loading && <div className="cs-loading">Generating report…</div>}

      {error && <div className="cs-error">{error}</div>}

      {!loading && !error && !data && (
        <div className="cs-empty">Select filters and click "Generate Report" to view results.</div>
      )}

      {!loading && !error && data && (
        <>
          <div className="cs-dash-cards">
            <div className="cs-dash-card">
              <div className="cs-dash-card__value">{data.summary.totalCount}</div>
              <div className="cs-dash-card__label">Total Complaints</div>
            </div>
            <div className="cs-dash-card">
              <div className="cs-dash-card__value">{data.summary.resolvedCount}</div>
              <div className="cs-dash-card__label">Resolved</div>
            </div>
            <div className="cs-dash-card">
              <div className="cs-dash-card__value">
                {data.summary.totalCount > 0
                  ? `${((data.summary.resolvedCount / data.summary.totalCount) * 100).toFixed(1)}%`
                  : '—'}
              </div>
              <div className="cs-dash-card__label">Resolution Rate</div>
            </div>
            <div className="cs-dash-card">
              <div className="cs-dash-card__value">
                {data.summary.avgResolutionHrs !== null
                  ? `${data.summary.avgResolutionHrs.toFixed(1)} hrs`
                  : '—'}
              </div>
              <div className="cs-dash-card__label">Avg Resolution Time</div>
            </div>
          </div>

          {data.complaints.length === 0 ? (
            <div className="cs-empty">No complaints match the selected filters.</div>
          ) : (
            <div className="cs-table-wrap">
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>Complaint #</th>
                    <th>Subject</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Consumer</th>
                    <th>Created</th>
                    <th>Resolved At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.complaints.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/complaints/${c.id}`} className="cs-link">
                          {c.complaintNumber}
                        </Link>
                      </td>
                      <td>{c.subject}</td>
                      <td>
                        <span className={`cs-badge cs-badge--type-${c.type}`}>
                          {COMPLAINT_TYPE_LABELS[c.type as ComplaintType] ?? c.type}
                        </span>
                      </td>
                      <td>
                        <span className={`cs-badge cs-badge--priority-${c.priority}`}>
                          {COMPLAINT_PRIORITY_LABELS[c.priority as ComplaintPriority] ?? c.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`cs-badge cs-badge--status-${c.status}`}>
                          {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus] ?? c.status}
                        </span>
                      </td>
                      <td>
                        {c.consumer
                          ? `${c.consumer.firstName} ${c.consumer.lastName}`
                          : '—'}
                      </td>
                      <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td>
                        {c.resolvedAt
                          ? new Date(c.resolvedAt).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
