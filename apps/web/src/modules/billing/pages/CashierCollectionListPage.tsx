import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  CashierCollectionApiError,
  createReport,
  deleteReport,
  listBankAccounts,
  listReports,
  recordDeposit,
  type BankAccountOption,
  type CashierReportListItem,
  type JevRef,
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

const JEV_STATUS_COLOR: Record<string, string> = {
  draft: '#b54708',
  for_review: '#b54708',
  approved: '#175cd3',
  posted: '#067647',
  voided: '#b42318',
  reversed: '#b42318',
};
function JevBadge({ jev }: { jev: JevRef | null }) {
  if (!jev) return <span style={{ color: '#98a2b3' }}>—</span>;
  const label =
    jev.status === 'for_review'
      ? 'For review'
      : jev.status.charAt(0).toUpperCase() + jev.status.slice(1);
  return (
    <span style={{ fontSize: 12 }}>
      <span style={{ fontFamily: 'monospace' }}>{jev.jevNumber}</span>{' '}
      <span style={{ fontWeight: 600, color: JEV_STATUS_COLOR[jev.status] ?? '#667085' }}>
        · {label}
      </span>
    </span>
  );
}

export default function CashierCollectionListPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<CashierReportListItem[]>([]);
  const [error, setError] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const [banks, setBanks] = useState<BankAccountOption[]>([]);
  // The report whose deposit is being recorded (drives the modal).
  const [depositFor, setDepositFor] = useState<CashierReportListItem | null>(null);
  const [depDate, setDepDate] = useState(new Date().toISOString().slice(0, 10));
  const [depBank, setDepBank] = useState('');
  const [depositing, setDepositing] = useState(false);

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
    listBankAccounts()
      .then(setBanks)
      .catch(() => {});
  }, [load]);

  function openDeposit(r: CashierReportListItem) {
    setDepositFor(r);
    setDepDate(r.reportDate.slice(0, 10));
    setDepBank(banks[0]?.id ?? '');
    setError('');
  }

  async function saveDeposit() {
    if (!depositFor || !depBank) return;
    setDepositing(true);
    setError('');
    try {
      await recordDeposit(depositFor.id, { depositDate: depDate, bankAccountId: depBank });
      setDepositFor(null);
      await load();
    } catch (e) {
      setError(
        e instanceof CashierCollectionApiError ? e.message : 'Failed to record the deposit.',
      );
    } finally {
      setDepositing(false);
    }
  }

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
                <th>Collection JEV</th>
                <th>Deposit</th>
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
                    <JevBadge jev={r.collectionJev} />
                  </td>
                  <td>
                    {r.status !== 'submitted' ? (
                      <span style={{ color: '#98a2b3' }}>—</span>
                    ) : r.depositRecordedAt ? (
                      <div style={{ fontSize: 12 }}>
                        <div style={{ color: '#067647', fontWeight: 600 }}>
                          Deposited {r.depositDate ? fmtDate(r.depositDate) : ''}
                        </div>
                        <JevBadge jev={r.depositJev} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="bill-btn bill-btn--sm"
                        onClick={() => openDeposit(r)}
                      >
                        Record deposit
                      </button>
                    )}
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

      {depositFor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => !depositing && setDepositFor(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              width: 440,
              maxWidth: '92vw',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>
              Record deposit — {depositFor.reportNumber}
            </h3>
            <p style={{ fontSize: 13, color: '#667085', marginTop: 0 }}>
              Confirm the {peso(depositFor.totalAmount)} collection now appears in the passbook /
              bank statement. This creates a draft entry (Dr Bank, Cr Cash - Collecting Officer) for
              the accountant to review and post.
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Deposit date (per passbook / statement)
              </label>
              <input
                type="date"
                value={depDate}
                onChange={(e) => setDepDate(e.target.value)}
                style={{
                  padding: '8px 10px',
                  border: '1px solid #d0d5dd',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Deposited to bank account
              </label>
              <select
                value={depBank}
                onChange={(e) => setDepBank(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #d0d5dd',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <option value="">— Select bank account —</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id} disabled={!b.hasGl}>
                    {b.label}
                    {!b.hasGl ? ' (no GL account)' : ''}
                  </option>
                ))}
              </select>
              {banks.length === 0 && (
                <div style={{ fontSize: 12, color: '#b42318', marginTop: 4 }}>
                  No active bank accounts are set up.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="bill-btn"
                onClick={() => setDepositFor(null)}
                disabled={depositing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bill-btn bill-btn--primary"
                onClick={saveDeposit}
                disabled={depositing || !depBank}
              >
                {depositing ? 'Saving…' : 'Record deposit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
