import { useEffect, useMemo, useRef, useState } from 'react';
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
const round2 = (n: number) => Math.round(n * 100) / 100;

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

  const [orNumber, setOrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  // Cash handed over by the customer; drives change + how far the waterfall reaches.
  const [tendered, setTendered] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Post-payment receipt prompt: when set, a modal offers to print the invoice.
  const [receipt, setReceipt] = useState<{
    id: string;
    orNumber: string;
    amount: number;
    tendered: number;
    change: number;
  } | null>(null);
  // The Accept Payment panel is a floating window, opened by "Collect Payment".
  const [showCollect, setShowCollect] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
    if (resetForm) {
      setPaymentDate(today());
      setMethod('cash');
      setCheckNumber('');
      setCheckDate('');
      setBankName('');
      setReferenceNumber('');
      setRemarks('');
      setTendered('');
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
    setShowCollect(false);
    setSearch('');
    setError('');
    setSuccess('');
  }

  // Start a fresh collection for another customer: wipe the account/ledger and
  // put the cursor back in the search box, ready for the next name or number.
  function startNew() {
    clearSelection();
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // Each bill's balance already includes any 10% late penalty accrued on the 25th
  // (booked to A/R by the server). The amount due is simply that balance.
  const totalDue = unpaid.reduce((s, b) => s + Number(b.balance), 0);

  function openCollect() {
    // Prefill tender with the full amount due — the common exact-payment case.
    setTendered(totalDue > 0 ? totalDue.toFixed(2) : '');
    setError('');
    setShowCollect(true);
  }

  // Waterfall the tendered cash across bills OLDEST FIRST: each bill's balance
  // (principal + any accrued penalty) must clear before money reaches a newer
  // bill. A short payment settles the earliest deficiencies and leaves the rest.
  const collect = useMemo(() => {
    const tenderNum = parseFloat(tendered);
    const hasTender = !isNaN(tenderNum) && tenderNum > 0;
    // Amount we actually apply never exceeds what is owed (the rest is change).
    let budget = hasTender ? Math.min(tenderNum, totalDue) : 0;
    const lines = unpaid.map((b) => {
      const balance = Number(b.balance);
      const penalty = Number(b.penaltyAmount);
      let applied = 0;
      if (budget > 0.005) {
        applied = Math.min(balance, round2(budget));
        budget = round2(budget - applied);
      }
      return { bill: b, balance, penalty, applied };
    });
    const totalApplied = round2(lines.reduce((s, l) => s + l.applied, 0));
    const change = hasTender ? Math.max(0, round2(tenderNum - totalApplied)) : 0;
    const shortfall = round2(totalDue - totalApplied);
    return { lines, totalApplied, change, hasTender, tenderNum, shortfall };
  }, [unpaid, tendered, totalDue]);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const allocs = collect.lines
      .filter((l) => l.applied > 0)
      .map((l) => ({ billId: l.bill.id, amountApplied: l.applied }));
    if (allocs.length === 0 || collect.totalApplied <= 0) {
      setError('Enter an amount tendered to apply against the outstanding bills.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const created = await createPayment({
        orNumber,
        consumerId: selected.id,
        paymentDate,
        totalAmount: collect.totalApplied,
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
      setSuccess(`Payment ${created.orNumber} recorded — ${formatPeso(collect.totalApplied)}.`);
      // Close the collect window, refresh ledger + remaining bills + next OR,
      // then prompt to print the invoice.
      setShowCollect(false);
      await loadFor(selected, true);
      setReceipt({
        id: created.id,
        orNumber: created.orNumber,
        amount: collect.totalApplied,
        tendered: collect.hasTender ? collect.tenderNum : collect.totalApplied,
        change: collect.change,
      });
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
            <div style={{ position: 'relative' }}>
              <input
                ref={searchRef}
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
                style={{ paddingRight: 32, width: '100%' }}
              />
              {(selected || search.length > 0) && (
                <button
                  type="button"
                  aria-label="Clear"
                  title="Clear"
                  onClick={startNew}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 20,
                    lineHeight: 1,
                    color: '#98a2b3',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
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
                  {unpaid.length > 0 ? (
                    <button
                      type="button"
                      className="bill-btn bill-btn--primary"
                      style={{ marginTop: 8, fontSize: 13, padding: '6px 14px' }}
                      onClick={openCollect}
                    >
                      Collect Payment
                    </button>
                  ) : (
                    ledger && (
                      <div
                        style={{ marginTop: 8, fontSize: 12, color: '#067647', fontWeight: 600 }}
                      >
                        Fully paid — nothing to collect
                      </div>
                    )
                  )}
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
                      {/* Latest first for viewing convenience; each row still
                          shows the running balance as of that date. */}
                      {[...ledger.ledger].reverse().map((en, i) => (
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

              {/* Accept Payment — floating window opened by "Collect Payment". */}
              {showCollect && unpaid.length > 0 && (
                <div
                  role="dialog"
                  aria-modal="true"
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(16,24,40,0.55)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    zIndex: 40,
                    overflowY: 'auto',
                    padding: '40px 16px',
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setShowCollect(false);
                  }}
                >
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      padding: 24,
                      width: 820,
                      maxWidth: '95vw',
                      boxShadow: '0 20px 48px rgba(16,24,40,0.28)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0 }}>
                        Accept Payment —{' '}
                        <span style={{ fontWeight: 600 }}>
                          {selected.lastName}, {selected.firstName}
                        </span>
                      </h3>
                      <button
                        type="button"
                        className="bill-btn"
                        style={{ padding: '2px 10px', fontSize: 16, lineHeight: 1 }}
                        aria-label="Close"
                        onClick={() => setShowCollect(false)}
                      >
                        ✕
                      </button>
                    </div>

                    <form className="bill-form" onSubmit={record}>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#667085' }}>
                        Payment applies to the oldest bills first. A bill&apos;s amount due already
                        includes any 10% late penalty accrued on the 25th of its due month.
                      </p>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="bill-table">
                          <thead>
                            <tr>
                              <th>Bill #</th>
                              <th>Period</th>
                              <th>Due</th>
                              <th style={{ textAlign: 'right' }}>Penalty (10%)</th>
                              <th style={{ textAlign: 'right' }}>Amount Due</th>
                              <th style={{ textAlign: 'right' }}>Applied</th>
                            </tr>
                          </thead>
                          <tbody>
                            {collect.lines.map((l) => (
                              <tr key={l.bill.id}>
                                <td className="bill-text-mono">{l.bill.billNumber}</td>
                                <td>{l.bill.billingPeriod.name}</td>
                                <td style={{ color: l.penalty > 0 ? '#b42318' : undefined }}>
                                  {new Date(l.bill.dueDate).toLocaleDateString('en-PH')}
                                  {l.penalty > 0 && (
                                    <span style={{ fontSize: 11, fontWeight: 600 }}>
                                      {' '}
                                      · penalized
                                    </span>
                                  )}
                                </td>
                                <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                                  {l.penalty > 0 ? formatPeso(l.penalty) : '—'}
                                </td>
                                <td
                                  className="bill-text-mono"
                                  style={{ textAlign: 'right', fontWeight: 600 }}
                                >
                                  {formatPeso(l.balance)}
                                </td>
                                <td
                                  className="bill-text-mono"
                                  style={{
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    color: l.applied > 0 ? '#067647' : '#98a2b3',
                                  }}
                                >
                                  {l.applied > 0 ? formatPeso(l.applied) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td colSpan={4} style={{ textAlign: 'right' }}>
                                Total Amount Due:
                              </td>
                              <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                                {formatPeso(totalDue)}
                              </td>
                              <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                                {formatPeso(collect.totalApplied)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Cash tendered + change */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr',
                          gap: 12,
                          alignItems: 'end',
                          background: '#f9fafb',
                          border: '1px solid #eaecf0',
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <div className="bill-field" style={{ margin: 0 }}>
                          <label>Amount Tendered</label>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            inputMode="decimal"
                            value={tendered}
                            onChange={(e) => setTendered(e.target.value)}
                            style={{ fontSize: 16 }}
                          />
                        </div>
                        <div>
                          <div
                            style={{ fontSize: 11, color: '#475467', textTransform: 'uppercase' }}
                          >
                            Amount Applied
                          </div>
                          <div className="bill-text-mono" style={{ fontSize: 18, fontWeight: 700 }}>
                            {formatPeso(collect.totalApplied)}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{ fontSize: 11, color: '#475467', textTransform: 'uppercase' }}
                          >
                            Change
                          </div>
                          <div
                            className="bill-text-mono"
                            style={{ fontSize: 18, fontWeight: 700, color: '#067647' }}
                          >
                            {formatPeso(collect.change)}
                          </div>
                        </div>
                      </div>
                      {collect.shortfall > 0.005 && collect.totalApplied > 0 && (
                        <div style={{ fontSize: 12, color: '#b54708', marginTop: 6 }}>
                          Short payment — {formatPeso(collect.shortfall)} will remain outstanding on
                          the newer bills.
                        </div>
                      )}

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr',
                          gap: 12,
                          marginTop: 12,
                        }}
                      >
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
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}
                        >
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
                        <button
                          type="button"
                          className="bill-btn"
                          onClick={() => setShowCollect(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="bill-btn bill-btn--primary"
                          disabled={saving || collect.totalApplied <= 0}
                        >
                          {saving
                            ? 'Recording…'
                            : `Record Payment (${formatPeso(collect.totalApplied)})`}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Post-payment prompt: print the invoice or return to the ledger. */}
          {receipt && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(16,24,40,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 28,
                  width: 400,
                  maxWidth: '90vw',
                  boxShadow: '0 20px 48px rgba(16,24,40,0.28)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: '#ecfdf3',
                    color: '#067647',
                    fontSize: 30,
                    lineHeight: '52px',
                    margin: '0 auto 12px',
                  }}
                >
                  ✓
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Payment Recorded</h3>
                <p style={{ color: '#475467', margin: 0 }}>
                  OR <span className="bill-text-mono">{receipt.orNumber}</span> —{' '}
                  <strong>{formatPeso(receipt.amount)}</strong>
                </p>
                {receipt.change > 0.005 && (
                  <p style={{ color: '#475467', margin: '6px 0 0', fontSize: 13 }}>
                    Tendered {formatPeso(receipt.tendered)} · Change{' '}
                    <strong style={{ color: '#067647' }}>{formatPeso(receipt.change)}</strong>
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    marginTop: 22,
                  }}
                >
                  <button
                    type="button"
                    className="bill-btn bill-btn--primary"
                    onClick={() => {
                      window.open(`/billing/print/invoice/${receipt.id}`, '_blank', 'noopener');
                      setReceipt(null);
                    }}
                  >
                    Print Invoice
                  </button>
                  <button type="button" className="bill-btn" onClick={() => setReceipt(null)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
