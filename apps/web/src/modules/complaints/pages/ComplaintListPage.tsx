import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/auth';
import { getComplaints } from '../api';
import type {
  Complaint,
  ComplaintType,
  ComplaintPriority,
  ComplaintStatus,
} from '../types';
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_PRIORITY_LABELS,
  COMPLAINT_STATUS_LABELS,
} from '../types';
import '../complaints.css';

export default function ComplaintListPage() {
  const { permissions } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';
  const search = searchParams.get('search') ?? '';

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(search ? { search } : {}),
    });

    getComplaints(params.toString())
      .then(setComplaints)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load complaints'),
      )
      .finally(() => setLoading(false));
  }, [status, type, search]);

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
    <div className="cs-page">
      <div className="cs-page__header">
        <h1>Complaints</h1>
        <div className="cs-page__actions">
          <Link to="/complaints/dashboard" className="cs-btn">
            Dashboard
          </Link>
          {permissions.has('complaint.reports') && (
            <Link to="/complaints/reports" className="cs-btn">
              Reports
            </Link>
          )}
          {permissions.has('complaint.create') && (
            <Link to="/complaints/new" className="cs-btn cs-btn--primary">
              + New Complaint
            </Link>
          )}
        </div>
      </div>

      <div className="cs-filters">
        <input
          className="cs-input"
          type="text"
          placeholder="Search complaints..."
          value={search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select
          className="cs-select"
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="reopened">Reopened</option>
        </select>
        <select
          className="cs-select"
          value={type}
          onChange={(e) => setFilter('type', e.target.value)}
        >
          <option value="">All Types</option>
          {Object.entries(COMPLAINT_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="cs-error">{error}</div>}

      {loading ? (
        <div className="cs-loading">Loading...</div>
      ) : complaints.length === 0 ? (
        <div className="cs-empty">No complaints found.</div>
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
                <th>Assigned To</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/complaints/${c.id}`}>{c.complaintNumber}</Link>
                  </td>
                  <td>{c.subject}</td>
                  <td>
                    <span
                      className={`cs-badge cs-badge--type-${c.type}`}
                    >
                      {COMPLAINT_TYPE_LABELS[c.type as ComplaintType] ?? c.type}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`cs-badge cs-badge--priority-${c.priority}`}
                    >
                      {COMPLAINT_PRIORITY_LABELS[c.priority as ComplaintPriority] ?? c.priority}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`cs-badge cs-badge--status-${c.status}`}
                    >
                      {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus] ?? c.status}
                    </span>
                  </td>
                  <td>
                    {c.consumer
                      ? `${c.consumer.firstName} ${c.consumer.lastName}`
                      : '—'}
                  </td>
                  <td>
                    {c.assignee
                      ? `${c.assignee.firstName} ${c.assignee.lastName}`
                      : '—'}
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
