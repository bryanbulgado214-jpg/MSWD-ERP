import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Complaint, ComplaintType, ComplaintPriority, ComplaintStatus } from '../types';
import { COMPLAINT_TYPE_LABELS, COMPLAINT_PRIORITY_LABELS, COMPLAINT_STATUS_LABELS } from '../types';
import { getDashboard } from '../api';
import '../complaints.css';

interface DashboardData {
  byStatus: Array<{ status: string; _count: number }>;
  byType: Array<{ type: string; _count: number }>;
  byPriority: Array<{ priority: string; _count: number }>;
  recentComplaints: Array<Complaint>;
  slaBreached: number;
}

export default function ComplaintDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="cs-loading">Loading dashboard…</div>;
  }

  if (error) {
    return <div className="cs-error">{error}</div>;
  }

  if (!data) {
    return <div className="cs-error">No data available</div>;
  }

  const totalComplaints = data.byStatus.reduce((sum, s) => sum + s._count, 0);
  const getStatusCount = (status: string) =>
    data.byStatus.find((s) => s.status === status)?._count ?? 0;

  const openCount = getStatusCount('open');
  const assignedCount = getStatusCount('assigned');
  const inProgressCount = getStatusCount('in_progress');
  const resolvedCount = getStatusCount('resolved');

  const typeMaxCount = Math.max(...data.byType.map((t) => t._count), 1);
  const priorityMaxCount = Math.max(...data.byPriority.map((p) => p._count), 1);

  return (
    <div className="cs-page">
      <div className="cs-page__header">
        <h1>Complaints Dashboard</h1>
        <div className="cs-page__actions">
          <Link to="/complaints" className="cs-btn">
            ← Back to List
          </Link>
        </div>
      </div>

      <div className="cs-dash-cards">
        <div className="cs-dash-card">
          <div className="cs-dash-card__value">{totalComplaints}</div>
          <div className="cs-dash-card__label">Total Complaints</div>
        </div>
        <div className={`cs-dash-card${openCount > 0 ? ' cs-dash-card--active' : ''}`}>
          <div className="cs-dash-card__value">{openCount}</div>
          <div className="cs-dash-card__label">Open</div>
        </div>
        <div className={`cs-dash-card${assignedCount > 0 ? ' cs-dash-card--active' : ''}`}>
          <div className="cs-dash-card__value">{assignedCount}</div>
          <div className="cs-dash-card__label">Assigned</div>
        </div>
        <div className={`cs-dash-card${inProgressCount > 0 ? ' cs-dash-card--active' : ''}`}>
          <div className="cs-dash-card__value">{inProgressCount}</div>
          <div className="cs-dash-card__label">In Progress</div>
        </div>
        <div className={`cs-dash-card${resolvedCount > 0 ? ' cs-dash-card--active' : ''}`}>
          <div className="cs-dash-card__value">{resolvedCount}</div>
          <div className="cs-dash-card__label">Resolved</div>
        </div>
        <div className="cs-dash-card cs-dash-card--sla">
          <div className="cs-dash-card__value">{data.slaBreached}</div>
          <div className="cs-dash-card__label">SLA Breached</div>
        </div>
      </div>

      <div className="cs-dash-grid">
        <div className="cs-card">
          <h2 className="cs-card__title">By Type</h2>
          <div className="cs-dash-bars">
            {data.byType.map((item) => (
              <div key={item.type} className="cs-dash-bar">
                <span className={`cs-badge cs-badge--type-${item.type}`}>
                  {COMPLAINT_TYPE_LABELS[item.type as ComplaintType] ?? item.type}
                </span>
                <div className="cs-dash-bar__track">
                  <div
                    className="cs-dash-bar__fill"
                    style={{ width: `${(item._count / typeMaxCount) * 100}%` }}
                  />
                </div>
                <span className="cs-dash-bar__count">{item._count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cs-card">
          <h2 className="cs-card__title">By Priority</h2>
          <div className="cs-dash-bars">
            {data.byPriority.map((item) => (
              <div key={item.priority} className="cs-dash-bar">
                <span className={`cs-badge cs-badge--priority-${item.priority}`}>
                  {COMPLAINT_PRIORITY_LABELS[item.priority as ComplaintPriority] ?? item.priority}
                </span>
                <div className="cs-dash-bar__track">
                  <div
                    className="cs-dash-bar__fill"
                    style={{ width: `${(item._count / priorityMaxCount) * 100}%` }}
                  />
                </div>
                <span className="cs-dash-bar__count">{item._count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cs-card">
        <h2 className="cs-card__title">Recent Complaints</h2>
        <div className="cs-table-wrap">
          <table className="cs-table">
            <thead>
              <tr>
                <th>Complaint#</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recentComplaints.slice(0, 10).map((complaint) => (
                <tr key={complaint.id}>
                  <td>
                    <Link to={`/complaints/${complaint.id}`} className="cs-link">
                      {complaint.complaintNumber}
                    </Link>
                  </td>
                  <td>{complaint.subject}</td>
                  <td>
                    <span className={`cs-badge cs-badge--type-${complaint.type}`}>
                      {COMPLAINT_TYPE_LABELS[complaint.type as ComplaintType] ?? complaint.type}
                    </span>
                  </td>
                  <td>
                    <span className={`cs-badge cs-badge--priority-${complaint.priority}`}>
                      {COMPLAINT_PRIORITY_LABELS[complaint.priority as ComplaintPriority] ?? complaint.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`cs-badge cs-badge--status-${complaint.status}`}>
                      {COMPLAINT_STATUS_LABELS[complaint.status as ComplaintStatus] ?? complaint.status}
                    </span>
                  </td>
                  <td>{new Date(complaint.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
