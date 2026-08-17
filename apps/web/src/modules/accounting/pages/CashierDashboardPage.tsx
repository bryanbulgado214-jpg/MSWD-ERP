import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { AccountingApiError, getChecks, getDisbursements } from '../api';
import type { CheckListItem, DisbursementSummary } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function peso(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

interface Data {
  checks: CheckListItem[];
  dvs: DisbursementSummary[];
}

export default function CashierDashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [checks, dvs] = await Promise.all([getChecks(), getDisbursements()]);
      setData({ checks, dvs });
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checks = data?.checks ?? [];
  const sum = (list: CheckListItem[]) => list.reduce((s, c) => s + parseFloat(c.amount), 0);
  const pending = checks.filter((c) => c.status === 'pending');
  const printed = checks.filter((c) => c.status === 'printed');
  const released = checks.filter((c) => c.status === 'released');
  const voided = checks.filter((c) => c.status === 'voided' || c.status === 'spoiled');

  const card = (label: string, value: string, sub?: string, accent?: string): JSX.Element => (
    <div
      style={{
        flex: '1 1 180px',
        minWidth: 0,
        background: '#fff',
        border: '1px solid #eaecf0',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#667085',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent ?? '#101828', marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#98a2b3', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Cashiering Dashboard</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 720 }}>
        Your disbursement workload — checks to print, issue, and account for. Every check is backed
        by a Disbursement Voucher prepared by the accountant.
      </p>

      {error && <div className="acct-error">{error}</div>}
      {!data && !error && <div className="acct-empty">Loading...</div>}

      {data && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
            {card(
              'Awaiting Printing',
              String(pending.length),
              pending.length ? peso(sum(pending)) : 'all caught up',
              pending.length ? '#b54708' : '#101828',
            )}
            {card(
              'Printed (to release)',
              String(printed.length),
              printed.length ? peso(sum(printed)) : undefined,
            )}
            {card(
              'Released',
              String(released.length),
              released.length ? peso(sum(released)) : undefined,
              '#067647',
            )}
            {card('Voided / Spoiled', String(voided.length))}
            {card('Disbursement Vouchers', String(data.dvs.length))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0 }}>Checks awaiting printing</h2>
            <Link to="/accounting/checks" className="acct-table__link">
              Open Check Register →
            </Link>
          </div>
          {pending.length === 0 ? (
            <div className="acct-empty">No checks are waiting to be printed.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>DV #</th>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Bank</th>
                    <th className="acct-text-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((c) => (
                    <tr key={c.id}>
                      <td>{c.disbursementVoucher?.dvNumber ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(c.checkDate).toLocaleDateString()}
                      </td>
                      <td>{c.payeeName}</td>
                      <td>
                        {c.bankAccount.bank.code} — {c.bankAccount.accountName}
                      </td>
                      <td className="acct-text-right acct-text-mono">{peso(c.amount)}</td>
                      <td>
                        <Link to="/accounting/checks" className="acct-table__link">
                          Print
                        </Link>
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
