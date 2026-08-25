import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  CashierCollectionApiError,
  createReport,
  deleteReport,
  listReports,
  type CashierReportListItem,
} from '../cashierCollectionApi';

import BillingSubNav from './BillingSubNav';
import './billing.css';

function peso(v: number) {
  return (v || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CashierCollectionListPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<CashierReportListItem[]>([]);
  const [error, setError] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setReports(await listReports());
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to load reports.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function onCreate() {
    setCreating(true);
    setError('');
    try {
      const r = await createReport(newDate);
      navigate(`/billing/cashier-report/${r.id}`);
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to create the report.');
      setCreating(false);
    }
  }

  async function onDelete(r: CashierReportListItem) {
    if (!window.confirm(`Delete draft ${r.reportNumber}? This cannot be undone.`)) return;
    try {
      await deleteReport(r.id);
      await load();
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to delete.');
    }
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Cashier Daily Collection Report</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 760 }}>
        Consolidate each teller&apos;s daily collectors&apos; report (with its cash count) into one
        report, verify the combined cash, then submit — creating a draft journal entry for the
        accountant&apos;s review.
      </p>

      {error && (
        <div className="bill-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: '#344054',
              marginBottom: 4,
            }}
          >
            Report date
          </label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            style={{
              padding: '8px 10px',
              border: '1px solid #d0d5dd',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
        </div>
        <button
          type="button"
          className="bill-btn bill-btn--primary"
          disabled={creating}
          onClick={onCreate}
        >
          {creating ? 'Creating…' : '+ New Report'}
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="bill-empty">No collection reports yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Report #</th>
                <th>Date</th>
                <th>Tellers</th>
                <th style={{ textAlign: 'right' }}>Total Collections</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/billing/cashier-report/${r.id}`} className="bill-link">
                      {r.reportNumber}
                    </Link>
                  </td>
                  <td>{fmtDate(r.reportDate)}</td>
                  <td>{r.entryCount}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {peso(r.totalAmount)}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: r.status === 'submitted' ? '#067647' : '#b54708',
                      }}
                    >
                      {r.status === 'submitted' ? 'Submitted' : 'Draft'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Link to={`/billing/cashier-report/${r.id}`} className="bill-link">
                        Open
                      </Link>
                      {r.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => onDelete(r)}
                          style={{
                            color: '#b42318',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            font: 'inherit',
                            textDecoration: 'underline',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
