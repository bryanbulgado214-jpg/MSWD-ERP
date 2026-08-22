import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError,
  createPayment,
  getConsumerLedger,
  getConsumers,
  getNextOrNumber,
  getUnpaidBills,
} from '../api';
import type { ConsumerListItem, UnpaidBill } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

interface Ledger {
  totalBilled: number;
  totalPaid: number;
  balance: number;
  ledger: Array<{
    date: string;
    reference: string;
    particulars: string;
    charges: number;
    payments: number;
    balance: number;
  }>;
}

function formatPeso(val: number) {
  return (val || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Collection hub for the teller: search a consumer by account number or name,
 * see their account ledger, and accept payment — all on one screen.
 */
export default function CollectionPage() {
  const { hasPermission } = useAuth();
  const canCollect = hasPermission('billing.payment.collect');

  const [consumers, setConsumers] = useState<ConsumerListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ConsumerListItem | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [unpaid, setUnpaid] = useState<UnpaidBill[]>([]);
  const [allocations, setAllocations] = useState<Map<string, number>>(new Map());

  const [orNumber, setOrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getConsumers('status=active')
      .then(setConsumers)
      .catch(() => {});
  }, []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return consumers
      .filter(
        (c) =>
          c.accountNumber.toLowerCase().includes(q) ||
          `${c.lastName}, ${c.firstName}`.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [consumers, search]);

  async function loadFor(c: ConsumerListItem, resetForm: boolean) {
    const [led, bills] = await Promise.all([getConsumerLedger(c.id), getUnpaidBills(c.id)]);
    setLedger(led as Ledger);
    setUnpaid(bills);
    const auto = new Map<string, number>();
    for (const b of bills) auto.set(b.id, Number(b.balance));
    setAllocations(auto);
    if (resetForm) {
      setPaymentDate(today());
      setMethod('cash');
      setCheckNumber('');
      setCheckDate('');
      setBankName('');
      setReferenceNumber('');
      setRemarks('');
      try {
        const { nextOrNumber } = await getNextOrNumber();
        setOrNumber(nextOrNumber);
      } catch {
        setOrNumber('');
      }
    }
  }

  async function selectConsumer(c: ConsumerListItem) {
    setSelected(c);
    setLedger(null);
    setError('');
    setSuccess('');
    try {
      await loadFor(c, true);
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : 'Failed to load account.');
    }
  }

  function clearSelection() {
    setSelected(null);
    setLedger(null);
    setUnpaid([]);
    setAllocations(new Map());
    setSearch('');
    setError('');
  }

  function setAlloc(billId: string, amount: number) {
    setAllocations((prev) => {
      const next = new Map(prev);
      if (amount <= 0) next.delete(billId);
      else next.set(billId, amount);
      return next;
    });
  }

  const totalPayment = Array.from(allocations.values()).reduce((s, v) => s + v, 0);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (allocations.size === 0) {
      setError('Enter an amount against at least one bill.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const allocs = Array.from(allocations.entries()).map(([billId, amountApplied]) => ({
        billId,
        amountApplied,
      }));
      await createPayment({
        orNumber,
        consumerId: selected.id,
        paymentDate,
        totalAmount: totalPayment,
        paymentMethod: method,
        ...(method === 'check' && checkNumber ? { checkNumber } : {}),
        ...(method === 'check' && checkDate ? { checkDate } : {}),
        ...(method === 'check' && bankName ? { bankName } : {}),
        ...((method === 'online' || method === 'bank_deposit') && referenceNumber
          ? { referenceNumber }
          : {}),
        ...(remarks ? { remarks } : {}),
        allocations: allocs,
      });
      setSuccess(`Payment ${orNumber} recorded — ${formatPeso(totalPayment)}.`);
      await loadFor(selected, true); // refresh ledger + remaining bills + next OR
    } catch (err) {
      setError(err instanceof BillingApiError ? err.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Collection</h1>

      {!canCollect ? (
        <div className="bill-empty">You do not have permission to accept payments.</div>
      ) : (
        <>
          <div className="bill-field" style={{ maxWidth: 460 }}>
            <label>Account number or name</label>
            <input
              autoFocus
              placeholder="Type an account number or name…"
              value={
                selected
                  ? `${selected.accountNumber} — ${selected.lastName}, ${selected.firstName}`
                  : search
              }
              onChange={(e) => {
                if (selected) clearSelection();
                setSearch(e.target.value);
              }}
            />
          </div>

          {!selected && matches.length > 0 && (
            <table className="bill-table" style={{ maxWidth: 640, marginTop: 4 }}>
              <thead>
                <tr>
                  <th>Account #</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {matches.map((c) => (
                  <tr key={c.id}>
                    <td className="bill-text-mono">{c.accountNumber}</td>
                    <td>
                      {c.lastName}, {c.firstName}
                    </td>
                    <td>
                      <span className={`bill-badge bill-badge--${c.consumerType}`}>
                        {c.consumerType}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bill-btn bill-btn--primary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => selectConsumer(c)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!selected && search.trim().length >= 2 && matches.length === 0 && (
            <div className="bill-empty">No matching consumer.</div>
          )}

          {error && (
            <div className="bill-error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
          {success && (
            <div className="bill-success" style={{ marginTop: 12 }}>
              {success}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 16 }}>
              {/* Account header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#eff8ff',
                  border: '1px solid #b2ddff',
                  borderRadius: 8,
                  padding: '12px 16px',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {selected.lastName}, {selected.firstName}{' '}
                    <span className="bill-text-mono" style={{ color: '#475467', fontWeight: 400 }}>
                      ({selected.accountNumber})
                    </span>
                  </div>
                  <Link
                    to={`/billing/consumers/${selected.id}`}
                    className="bill-table__link"
                    style={{ fontSize: 12 }}
                  >
                    View full profile →
                  </Link>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#475467', textTransform: 'uppercase' }}>
                    Outstanding balance
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: ledger && ledger.balance > 0 ? '#b42318' : '#067647',
                    }}
                  >
                    {ledger ? formatPeso(ledger.balance) : '…'}
                  </div>
                </div>
              </div>

              {/* Ledger */}
              <h3 className="bill-section-title">Account Ledger</h3>
              {!ledger ? (
                <p style={{ color: '#667085' }}>Loading…</p>
              ) : ledger.ledger.length === 0 ? (
                <div className="bill-empty">No transactions yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="bill-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Particulars</th>
                        <th style={{ textAlign: 'right' }}>Charges</th>
                        <th style={{ textAlign: 'right' }}>Payments</th>
                        <th style={{ textAlign: 'right' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.ledger.map((en, i) => (
                        <tr key={i}>
                          <td>{new Date(en.date).toLocaleDateString('en-PH')}</td>
                          <td className="bill-text-mono">{en.reference}</td>
                          <td>{en.particulars}</td>
                          <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                            {en.charges > 0 ? formatPeso(en.charges) : ''}
                          </td>
                          <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                            {en.payments > 0 ? formatPeso(en.payments) : ''}
                          </td>
                          <td
                            className="bill-text-mono"
                            style={{ textAlign: 'right', fontWeight: 600 }}
                          >
                            {formatPeso(en.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Accept payment */}
              <h3 className="bill-section-title">Accept Payment</h3>
              {unpaid.length === 0 ? (
                <div className="bill-empty">No unpaid bills — nothing to collect.</div>
              ) : (
                <form className="bill-form" onSubmit={record}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="bill-table">
                      <thead>
                        <tr>
                          <th>Bill #</th>
                          <th>Period</th>
                          <th style={{ textAlign: 'right' }}>Balance</th>
                          <th>Due</th>
                          <th style={{ width: 130 }}>Amount to Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaid.map((b) => (
                          <tr key={b.id}>
                            <td className="bill-text-mono">{b.billNumber}</td>
                            <td>{b.billingPeriod.name}</td>
                            <td
                              className="bill-text-mono"
                              style={{ textAlign: 'right', fontWeight: 600 }}
                            >
                              {formatPeso(Number(b.balance))}
                            </td>
                            <td>{new Date(b.dueDate).toLocaleDateString('en-PH')}</td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={Number(b.balance)}
                                value={allocations.get(b.id) ?? ''}
                                onChange={(e) => setAlloc(b.id, parseFloat(e.target.value) || 0)}
                                style={{ width: 110, padding: '4px 8px' }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                          <td colSpan={4} style={{ textAlign: 'right' }}>
                            Total Payment:
                          </td>
                          <td className="bill-text-mono">{formatPeso(totalPayment)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div className="bill-field">
                      <label>OR Number *</label>
                      <input
                        required
                        className="bill-text-mono"
                        value={orNumber}
                        onChange={(e) => setOrNumber(e.target.value)}
                      />
                    </div>
                    <div className="bill-field">
                      <label>Payment Date *</label>
                      <input
                        type="date"
                        required
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                      />
                    </div>
                    <div className="bill-field">
                      <label>Method *</label>
                      <select value={method} onChange={(e) => setMethod(e.target.value)}>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="online">Online</option>
                        <option value="bank_deposit">Bank Deposit</option>
                      </select>
                    </div>
                  </div>

                  {method === 'check' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div className="bill-field">
                        <label>Check Number</label>
                        <input
                          value={checkNumber}
                          onChange={(e) => setCheckNumber(e.target.value)}
                        />
                      </div>
                      <div className="bill-field">
                        <label>Check Date</label>
                        <input
                          type="date"
                          value={checkDate}
                          onChange={(e) => setCheckDate(e.target.value)}
                        />
                      </div>
                      <div className="bill-field">
                        <label>Bank Name</label>
                        <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {(method === 'online' || method === 'bank_deposit') && (
                    <div className="bill-field" style={{ maxWidth: 320 }}>
                      <label>Reference Number</label>
                      <input
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="bill-field" style={{ maxWidth: 420 }}>
                    <label>Remarks</label>
                    <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  </div>

                  <div className="bill-form-actions">
                    <button type="button" className="bill-btn" onClick={clearSelection}>
                      Done
                    </button>
                    <button
                      type="submit"
                      className="bill-btn bill-btn--primary"
                      disabled={saving || totalPayment <= 0}
                    >
                      {saving ? 'Recording…' : `Record Payment (${formatPeso(totalPayment)})`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
