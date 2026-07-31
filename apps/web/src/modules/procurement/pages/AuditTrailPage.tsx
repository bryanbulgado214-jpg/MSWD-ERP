import { useEffect, useState } from 'react';

import type { AuditLogEntry } from '../api';
import { listAuditTrail, ProcurementApiError } from '../api';
import { ProcurementSubNav } from './ProcurementSubNav';
import './procurement.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: AuditLogEntry[] };

const TABLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All tables' },
  { value: 'purchase_requests', label: 'Purchase Requests' },
  { value: 'purchase_orders', label: 'Purchase Orders' },
  { value: 'certifications_of_availability', label: 'CAFs' },
  { value: 'obligation_requests', label: 'ORS' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'ors_children', label: 'ORS Children' },
  { value: 'ors_adjustments', label: 'ORS Adjustments' },
];

const TABLE_SHORT_NAMES: Record<string, string> = {
  'purchase_requests': 'PR',
  'purchase_request_items': 'PR Item',
  'purchase_orders': 'PO',
  'certifications_of_availability': 'CAF',
  'obligation_requests': 'ORS',
  'ors_children': 'ORS Child',
  'ors_adjustments': 'ORS Adj.',
  'suppliers': 'Supplier',
};

const ACTION_BADGES: Record<string, { className: string; label: string }> = {
  insert: { className: 'pr-badge--approved', label: 'Created' },
  update: { className: 'pr-badge--submitted', label: 'Updated' },
  delete: { className: 'pr-badge--rejected', label: 'Deleted' },
};

function formatChangedFields(fields: Record<string, unknown> | null): string {
  if (!fields) return '—';
  const keys = Object.keys(fields);
  if (keys.length === 0) return '—';
  if (keys.length <= 4) return keys.join(', ');
  return `${keys.slice(0, 4).join(', ')} +${keys.length - 4} more`;
}

export function AuditTrailPage() {
  const [tableFilter, setTableFilter] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    listAuditTrail({
      ...(tableFilter ? { tableName: tableFilter } : {}),
      limit: 100,
    })
      .then((data) => { if (!cancelled) setState({ status: 'loaded', data }); })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof ProcurementApiError ? e.message : 'Failed to load audit trail.' });
      });
    return () => { cancelled = true; };
  }, [tableFilter]);

  return (
    <div className="pr-page">
      <ProcurementSubNav />
      <h1>Audit Trail</h1>

      <div className="pr-toolbar">
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
          {TABLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <div className="pr-empty">Loading audit logs...</div>}
      {state.status === 'error' && <div className="pr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="pr-empty">No audit entries found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <table className="pr-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Table</th>
              <th>Action</th>
              <th>Changed Fields</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((entry) => {
              const badge = ACTION_BADGES[entry.action] ?? { className: '', label: entry.action };
              return (
                <tr key={entry.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {new Date(entry.performedAt).toLocaleString()}
                  </td>
                  <td>
                    <span className="pr-badge pr-badge--draft">
                      {TABLE_SHORT_NAMES[entry.tableName] ?? entry.tableName}
                    </span>
                  </td>
                  <td>
                    <span className={`pr-badge ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td style={{ fontSize: 12, color: '#475467', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {formatChangedFields(entry.changedFields as Record<string, unknown> | null)}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {entry.performedBy?.username ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
