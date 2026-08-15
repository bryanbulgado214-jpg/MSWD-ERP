import { useEffect, useMemo, useState } from 'react';

import { getAgingReport, getConsumerLedger } from '../../billing/api';
import { formatPeso } from '../../budgeting/format-peso';

interface AgingBill {
  consumerId: string;
  accountNumber: string;
  consumer: string;
  balance: number;
}
interface Aging {
  bills?: AgingBill[];
}

interface Ledger {
  totalBilled: number;
  totalPaid: number;
  balance: number;
  bills: Array<{
    id: string;
    billNumber: string;
    period: string;
    totalAmount: number | string;
    dueDate: string;
    status: string;
  }>;
  payments: Array<{
    id: string;
    orNumber: string;
    paymentDate: string;
    totalAmount: number | string;
  }>;
}

type Txn = { date: string; particulars: string; charge: number; payment: number };

/** AR Subsidiary Ledger — per-consumer receivable ledger (charges, payments, running balance). */
export function ArSubsidiaryLedgerPage() {
  const [consumers, setConsumers] = useState<{ id: string; label: string }[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    getAgingReport()
      .then((d) => {
        const bills = (d as Aging).bills ?? [];
        const m = new Map<string, string>();
        bills.forEach((b) => m.set(b.consumerId, `${b.consumer} (${b.accountNumber})`));
        setConsumers(
          [...m.entries()]
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load consumers.'));
  }, []);

  useEffect(() => {
    if (!selected) {
      setLedger(null);
      return;
    }
    setLoadingLedger(true);
    getConsumerLedger(selected)
      .then((d) => setLedger(d as Ledger))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load ledger.'))
      .finally(() => setLoadingLedger(false));
  }, [selected]);

  const txns = useMemo<Txn[]>(() => {
    if (!ledger) return [];
    const rows: Txn[] = [
      ...ledger.bills.map((b) => ({
        date: b.dueDate,
        particulars: `Bill ${b.billNumber} — ${b.period}`,
        charge: Number(b.totalAmount),
        payment: 0,
      })),
      ...ledger.payments.map((p) => ({
        date: p.paymentDate,
        particulars: `Payment — OR ${p.orNumber}`,
        charge: 0,
        payment: Number(p.totalAmount),
      })),
    ];
    return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [ledger]);

  let running = 0;
  const selectedLabel = consumers?.find((c) => c.id === selected)?.label;

  return (
    <div>
      <h2>AR Subsidiary Ledger</h2>
      <p className="reports-subtitle">
        Per-consumer receivable ledger — every bill and payment with a running balance. Lists
        consumers with outstanding water-bill balances.
      </p>

      <div className="reports-filters">
        <label htmlFor="arsl-consumer">Consumer</label>
        <select
          id="arsl-consumer"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ minWidth: 300 }}
        >
          <option value="">Select a consumer…</option>
          {(consumers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!consumers && !error && <div className="reports-loading">Loading…</div>}
      {consumers && consumers.length === 0 && (
        <div className="reports-empty">No consumers with outstanding balances.</div>
      )}
      {!selected && consumers && consumers.length > 0 && (
        <div className="reports-empty">Select a consumer to view their subsidiary ledger.</div>
      )}
      {loadingLedger && <div className="reports-loading">Loading ledger…</div>}

      {ledger && selected && !loadingLedger && (
        <>
          <div style={{ display: 'flex', gap: 24, margin: '4px 0 16px', flexWrap: 'wrap' }}>
            <div>
              <strong>{selectedLabel}</strong>
            </div>
            <div>
              Total Billed: <strong>{formatPeso(ledger.totalBilled)}</strong>
            </div>
            <div>
              Total Paid: <strong>{formatPeso(ledger.totalPaid)}</strong>
            </div>
            <div>
              Balance:{' '}
              <strong style={{ color: ledger.balance > 0 ? '#b42318' : '#067647' }}>
                {formatPeso(ledger.balance)}
              </strong>
            </div>
          </div>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Particulars</th>
                  <th className="num">Charge</th>
                  <th className="num">Payment</th>
                  <th className="num">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t, i) => {
                  running += t.charge - t.payment;
                  return (
                    <tr key={i}>
                      <td>{new Date(t.date).toLocaleDateString('en-PH')}</td>
                      <td>{t.particulars}</td>
                      <td className="num">{t.charge ? formatPeso(t.charge) : '—'}</td>
                      <td className="num">{t.payment ? formatPeso(t.payment) : '—'}</td>
                      <td className="num">{formatPeso(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Ending balance</td>
                  <td className="num">{formatPeso(ledger.totalBilled)}</td>
                  <td className="num">{formatPeso(ledger.totalPaid)}</td>
                  <td className="num">{formatPeso(ledger.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
