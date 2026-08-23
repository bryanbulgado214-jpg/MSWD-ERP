import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError,
  closeTellerSession,
  getTellerSession,
  listTellerSessions,
  openTellerSession,
  remitTellerSession,
} from '../api';
import type { TellerSession, TellerSessionDetail } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

function peso(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return (n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const PENDING: TellerSession['status'][] = ['open', 'closed', 'remitted'];

export default function TellerSessionPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('billing.session.manage');

  const [sessions, setSessions] = useState<TellerSession[]>([]);
  const [detail, setDetail] = useState<TellerSessionDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Remittance form.
  const [actualCash, setActualCash] = useState('');
  const [actualChecks, setActualChecks] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await listTellerSessions('mine=true');
      setSessions(list);
      const pending = list.find((s) => PENDING.includes(s.status));
      if (pending) {
        const d = await getTellerSession(pending.id);
        setDetail(d);
        setActualCash(d.session.cashAmount);
        setActualChecks(d.session.checkAmount);
      } else {
        setDetail(null);
      }
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : 'Failed to load sessions.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-error">You do not have access to teller sessions.</div>
      </div>
    );
  }

  const session = detail?.session ?? null;
  const live = detail?.live ?? null;
  const expected = session ? parseFloat(session.expectedRemittance) : 0;
  const actualTotal = (parseFloat(actualCash) || 0) + (parseFloat(actualChecks) || 0);
  const variance = actualTotal - expected;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>My Collection Session</h1>
      {error && <div className="bill-error">{error}</div>}

      {!session && (
        <div className="bill-card" style={{ padding: 20, marginBottom: 20 }}>
          <p style={{ marginTop: 0, color: '#475467' }}>
            You have no session in progress. Open one at the start of your shift — every payment you
            collect is tallied against it until you close and remit to the cashier.
          </p>
          <button
            type="button"
            className="bill-btn bill-btn--primary"
            disabled={busy}
            onClick={() => run(openTellerSession)}
          >
            {busy ? 'Opening…' : 'Open Session'}
          </button>
        </div>
      )}

      {session && (
        <div className="bill-card" style={{ padding: 20, marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{session.sessionNumber}</div>
              <div style={{ fontSize: 12, color: '#667085' }}>
                Opened {new Date(session.openedAt).toLocaleString('en-PH')}
                {session.beginningOrNumber
                  ? ` · OR ${session.beginningOrNumber}–${session.endingOrNumber ?? ''}`
                  : ''}
              </div>
            </div>
            <span className={`bill-badge bill-badge--${session.status}`}>{session.status}</span>
          </div>

          {/* Running / final tally */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
              margin: '16px 0',
            }}
          >
            <Stat
              label="Receipts"
              value={String(live?.transactionCount ?? session.transactionCount)}
            />
            <Stat label="Cash" value={peso(live?.cashAmount ?? session.cashAmount)} />
            <Stat label="Check" value={peso(live?.checkAmount ?? session.checkAmount)} />
            <Stat
              label="Electronic"
              value={peso(live?.electronicAmount ?? session.electronicAmount)}
            />
            <Stat
              label="Total"
              value={peso(live?.totalCollections ?? session.totalCollections)}
              accent
            />
          </div>

          {session.status === 'open' && (
            <button
              type="button"
              className="bill-btn bill-btn--primary"
              disabled={busy}
              onClick={() => run(() => closeTellerSession(session.id))}
            >
              {busy ? 'Closing…' : 'Close Session'}
            </button>
          )}

          {session.status === 'closed' && (
            <div style={{ borderTop: '1px solid #eaecf0', paddingTop: 16 }}>
              <h3 className="bill-section-title" style={{ marginTop: 0 }}>
                Remit to Cashier
              </h3>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="bill-field" style={{ marginBottom: 0 }}>
                  <label>Actual Cash</label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                  />
                </div>
                <div className="bill-field" style={{ marginBottom: 0 }}>
                  <label>Actual Checks</label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualChecks}
                    onChange={(e) => setActualChecks(e.target.value)}
                  />
                </div>
                <div style={{ fontSize: 13 }}>
                  <div>
                    Expected: <strong className="bill-text-mono">{peso(expected)}</strong>
                  </div>
                  <div>
                    Actual: <strong className="bill-text-mono">{peso(actualTotal)}</strong>
                  </div>
                  <div
                    style={{
                      color: Math.abs(variance) < 0.005 ? '#067647' : '#b42318',
                      fontWeight: 600,
                    }}
                  >
                    {variance === 0
                      ? 'Balanced'
                      : `${variance > 0 ? 'Overage' : 'Shortage'} ${peso(Math.abs(variance))}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="bill-btn bill-btn--primary"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      remitTellerSession(session.id, {
                        actualCashRemitted: parseFloat(actualCash) || 0,
                        actualChecksRemitted: parseFloat(actualChecks) || 0,
                      }),
                    )
                  }
                >
                  {busy ? 'Remitting…' : 'Remit to Cashier'}
                </button>
              </div>
            </div>
          )}

          {session.status === 'remitted' && (
            <div style={{ color: '#b54708', fontSize: 13 }}>
              Remitted{' '}
              {session.remittedAt ? new Date(session.remittedAt).toLocaleString('en-PH') : ''} —
              awaiting the cashier's acceptance.
              {parseFloat(session.shortageOverage) !== 0 &&
                ` (${parseFloat(session.shortageOverage) > 0 ? 'Overage' : 'Shortage'} ${peso(
                  Math.abs(parseFloat(session.shortageOverage)),
                )})`}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Link to={`/billing/print/session/${session.id}`} className="bill-link">
              Print daily collection report →
            </Link>
          </div>
        </div>
      )}

      <h3 className="bill-section-title">My Recent Sessions</h3>
      {sessions.length === 0 ? (
        <div className="bill-empty">No sessions yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Session #</th>
                <th>Date</th>
                <th>Receipts</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Short/Over</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="bill-text-mono">{s.sessionNumber}</td>
                  <td>{new Date(s.collectionDate).toLocaleDateString('en-PH')}</td>
                  <td>{s.transactionCount}</td>
                  <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                    {peso(s.totalCollections)}
                  </td>
                  <td
                    className="bill-text-mono"
                    style={{
                      textAlign: 'right',
                      color: parseFloat(s.shortageOverage) === 0 ? '#667085' : '#b42318',
                    }}
                  >
                    {peso(s.shortageOverage)}
                  </td>
                  <td>
                    <span className={`bill-badge bill-badge--${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    <Link to={`/billing/print/session/${s.id}`} className="bill-link">
                      Report
                    </Link>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? '#ecfdf3' : '#f8f9fc',
        borderRadius: 8,
        padding: '10px 14px',
      }}
    >
      <div style={{ fontSize: 11, color: '#667085', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: accent ? '#067647' : '#101828',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
