import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { BillingApiError, listTellerSessions, receiveTellerSession } from '../api';
import type { TellerSession } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

function peso(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return (n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function RemittancesPage() {
  const { hasPermission } = useAuth();
  const canReceive = hasPermission('collections.remittance.receive');

  const [pending, setPending] = useState<TellerSession[]>([]);
  const [recent, setRecent] = useState<TellerSession[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [remitted, accepted] = await Promise.all([
        listTellerSessions('status=remitted'),
        listTellerSessions('status=accepted'),
      ]);
      setPending(remitted);
      setRecent(accepted.slice(0, 15));
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : 'Failed to load remittances.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function receive(s: TellerSession) {
    if (
      parseFloat(s.shortageOverage) !== 0 &&
      !window.confirm(
        `This remittance has a ${parseFloat(s.shortageOverage) > 0 ? 'overage' : 'shortage'} of ${peso(
          Math.abs(parseFloat(s.shortageOverage)),
        )}. Accept anyway?`,
      )
    ) {
      return;
    }
    setBusyId(s.id);
    setError('');
    try {
      await receiveTellerSession(s.id);
      await load();
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : 'Failed to receive.');
    } finally {
      setBusyId('');
    }
  }

  if (!canReceive) {
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-error">You do not have access to remittances.</div>
      </div>
    );
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Teller Remittances</h1>
      <p style={{ color: '#475467', marginTop: 0 }}>
        Receive and verify the cash and checks tellers hand over at the end of their shifts.
        Accepted remittances feed the day's collection consolidation in Accounting.
      </p>
      {error && <div className="bill-error">{error}</div>}

      <h3 className="bill-section-title">Awaiting Acceptance ({pending.length})</h3>
      {pending.length === 0 ? (
        <div className="bill-empty">Nothing to receive right now.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Session #</th>
                <th>Teller</th>
                <th>Date</th>
                <th>Receipts</th>
                <th style={{ textAlign: 'right' }}>Expected</th>
                <th style={{ textAlign: 'right' }}>Actual</th>
                <th style={{ textAlign: 'right' }}>Short/Over</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => {
                const so = parseFloat(s.shortageOverage);
                return (
                  <tr key={s.id}>
                    <td className="bill-text-mono">
                      <Link to={`/billing/print/session/${s.id}`} className="bill-link">
                        {s.sessionNumber}
                      </Link>
                    </td>
                    <td>{s.tellerName}</td>
                    <td>{new Date(s.collectionDate).toLocaleDateString('en-PH')}</td>
                    <td>{s.transactionCount}</td>
                    <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                      {peso(s.expectedRemittance)}
                    </td>
                    <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                      {peso(s.totalActualRemittance)}
                    </td>
                    <td
                      className="bill-text-mono"
                      style={{ textAlign: 'right', color: so === 0 ? '#067647' : '#b42318' }}
                    >
                      {peso(so)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bill-btn bill-btn--primary"
                        disabled={busyId === s.id}
                        onClick={() => receive(s)}
                      >
                        {busyId === s.id ? 'Receiving…' : 'Receive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="bill-section-title">Recently Received</h3>
      {recent.length === 0 ? (
        <div className="bill-empty">No accepted remittances yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Session #</th>
                <th>Teller</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Short/Over</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td className="bill-text-mono">
                    <Link to={`/billing/print/session/${s.id}`} className="bill-link">
                      {s.sessionNumber}
                    </Link>
                  </td>
                  <td>{s.tellerName}</td>
                  <td>{new Date(s.collectionDate).toLocaleDateString('en-PH')}</td>
                  <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                    {peso(s.totalActualRemittance)}
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
                  <td>{s.receivedAt ? new Date(s.receivedAt).toLocaleString('en-PH') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
