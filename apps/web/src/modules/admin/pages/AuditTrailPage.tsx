import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { type AuditLogRow, getAuditActors, getAuditLogs, getAuditModules } from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

const ACTION_LABELS: Record<string, string> = {
  insert: 'Created',
  update: 'Updated',
  delete: 'Deleted',
};

function ChangedFields({ value }: { value: unknown }) {
  if (value == null) return <span style={{ color: '#98a2b3' }}>—</span>;
  let obj: Record<string, unknown>;
  try {
    obj = typeof value === 'string' ? JSON.parse(value) : (value as Record<string, unknown>);
  } catch {
    return <span style={{ color: '#98a2b3' }}>—</span>;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) return <span style={{ color: '#98a2b3' }}>—</span>;
  return (
    <details>
      <summary style={{ cursor: 'pointer', color: 'var(--mswd-blue, #175cd3)', fontSize: 12 }}>
        {keys.length} field{keys.length === 1 ? '' : 's'}
      </summary>
      <pre
        style={{
          margin: '6px 0 0',
          fontSize: 11,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: 420,
        }}
      >
        {JSON.stringify(obj, null, 2)}
      </pre>
    </details>
  );
}

export function AuditTrailPage() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [actors, setActors] = useState<{ id: string; username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters (record filter can be deep-linked from a record page)
  const [module, setModule] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const recordId = searchParams.get('recordId') ?? '';
  const tableName = searchParams.get('tableName') ?? '';

  useEffect(() => {
    getAuditModules()
      .then(setModules)
      .catch(() => {});
    getAuditActors()
      .then(setActors)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (module) params.set('module', module);
      if (performedBy) params.set('performedBy', performedBy);
      if (action) params.set('action', action);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (recordId) params.set('recordId', recordId);
      if (tableName) params.set('tableName', tableName);
      params.set('limit', '200');
      const result = await getAuditLogs(params.toString());
      setRows(result.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit trail.');
    } finally {
      setLoading(false);
    }
  }, [module, performedBy, action, from, to, recordId, tableName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="admin-page">
      <AdminSubNav />
      <h1>Audit Trail</h1>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 16px' }}>
        Every create, update, and delete is recorded automatically by a database trigger and
        attributed to the user who performed it — read-only and scoped to your organization.
      </p>

      {(recordId || tableName) && (
        <div
          style={{
            background: '#eff8ff',
            border: '1px solid #b2ddff',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          Showing history for a specific record{tableName ? ` in ${tableName}` : ''}.{' '}
          <Link to="/admin/audit-trail">Clear record filter</Link>
        </div>
      )}

      <div
        className="admin-toolbar"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}
      >
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={performedBy}
          onChange={(e) => setPerformedBy(e.target.value)}
          style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
        >
          <option value="">All users</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.username}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          <option value="insert">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>
        <label
          style={{ fontSize: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label
          style={{ fontSize: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading && <div className="admin-empty">Loading audit trail…</div>}
      {error && <div className="admin-error">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="admin-empty">No audit records match these filters.</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Record</th>
                <th>Changed Fields</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {new Date(r.performedAt).toLocaleString('en-PH')}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.performedBy?.username ?? '(system)'}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${r.action}`}>
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{r.module}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{r.tableLabel}</div>
                    <div style={{ color: '#98a2b3', fontFamily: 'monospace', fontSize: 11 }}>
                      {r.recordId.slice(0, 8)}…
                    </div>
                  </td>
                  <td>
                    <ChangedFields value={r.changedFields} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length >= 200 && (
            <p style={{ color: '#98a2b3', fontSize: 12, marginTop: 8 }}>
              Showing the most recent 200 records — narrow the filters to see older entries.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
