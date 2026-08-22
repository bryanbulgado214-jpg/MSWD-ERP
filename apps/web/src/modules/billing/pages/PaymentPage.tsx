import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError,
  createPayment,
  getConsumers,
  getNextOrNumber,
  getPayments,
  getUnpaidBills,
  voidPayment,
} from '../api';
import type { ConsumerListItem, PaymentListItem, UnpaidBill } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: T };

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function PaymentPage() {
  const { hasPermission } = useAuth();
  const canCollect = hasPermission('billing.payment.collect');
  const canVoid = hasPermission('billing.payment.void');

  const [payments, setPayments] = useState<LoadState<PaymentListItem[]>>({ status: 'idle' });
  const [showCollect, setShowCollect] = useState(false);
  const [consumers, setConsumers] = useState<ConsumerListItem[]>([]);
  const [consumerSearch, setConsumerSearch] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerListItem | null>(null);
  const [unpaidBills, setUnpaidBills] = useState<UnpaidBill[]>([]);
  const [allocations, setAllocations] = useState<Map<string, number>>(new Map());
  const [orNumber, setOrNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [voidingId, setVoidingId] = useState('');
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {
    setPayments({ status: 'loading' });
    try {
      const data = await getPayments();
      setPayments({ status: 'loaded', data });
    } catch (err) {
      setPayments({
        status: 'error',
        message: err instanceof BillingApiError ? err.message : 'Failed to load.',
      });
    }
  }

  async function openCollectForm() {
    setShowCollect(true);
    setSelectedConsumer(null);
    setUnpaidBills([]);
    setAllocations(new Map());
    setFormError('');
    setSuccessMsg('');
    setConsumerSearch('');
    setPaymentMethod('cash');
    setCheckNumber('');
    setCheckDate('');
    setBankName('');
    setReferenceNumber('');
    setRemarks('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    try {
      const { nextOrNumber } = await getNextOrNumber();
      setOrNumber(nextOrNumber);
    } catch {
      setOrNumber('');
    }
    try {
      const data = await getConsumers('status=active');
      setConsumers(data);
    } catch {
      setConsumers([]);
    }
  }

  async function selectConsumer(consumer: ConsumerListItem) {
    setSelectedConsumer(consumer);
    setAllocations(new Map());
    try {
      const bills = await getUnpaidBills(consumer.id);
      setUnpaidBills(bills);
      const auto = new Map<string, number>();
      for (const b of bills) auto.set(b.id, Number(b.balance));
      setAllocations(auto);
    } catch {
      setUnpaidBills([]);
    }
  }

  function setAllocationAmount(billId: string, amount: number) {
    setAllocations((prev) => {
      const next = new Map(prev);
      if (amount <= 0) next.delete(billId);
      else next.set(billId, amount);
      return next;
    });
  }

  const totalAllocation = Array.from(allocations.values()).reduce((s, v) => s + v, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConsumer) return;
    if (allocations.size === 0) {
      setFormError('Select at least one bill to apply payment to.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const allocs = Array.from(allocations.entries()).map(([billId, amountApplied]) => ({
        billId,
        amountApplied,
      }));
      await createPayment({
        orNumber,
        consumerId: selectedConsumer.id,
        paymentDate,
        totalAmount: totalAllocation,
        paymentMethod,
        ...(paymentMethod === 'check' && checkNumber ? { checkNumber } : {}),
        ...(paymentMethod === 'check' && checkDate ? { checkDate } : {}),
        ...(paymentMethod === 'check' && bankName ? { bankName } : {}),
        ...((paymentMethod === 'online' || paymentMethod === 'bank_deposit') && referenceNumber
          ? { referenceNumber }
          : {}),
        ...(remarks ? { remarks } : {}),
        allocations: allocs,
      });
      setShowCollect(false);
      setSuccessMsg(`Payment ${orNumber} recorded (${formatPeso(totalAllocation)}).`);
      loadPayments();
    } catch (err) {
      setFormError(err instanceof BillingApiError ? err.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid(payment: PaymentListItem) {
    if (!voidReason.trim()) return;
    try {
      await voidPayment(payment.id, {
        expectedVersion: payment.version,
        voidReason: voidReason.trim(),
      });
      setVoidingId('');
      setVoidReason('');
      loadPayments();
    } catch (err) {
      alert(err instanceof BillingApiError ? err.message : 'Failed to void payment.');
    }
  }

  const filteredConsumers =
    consumerSearch.length >= 2
      ? consumers
          .filter(
            (c) =>
              c.accountNumber.toLowerCase().includes(consumerSearch.toLowerCase()) ||
              `${c.lastName}, ${c.firstName}`.toLowerCase().includes(consumerSearch.toLowerCase()),
          )
          .slice(0, 20)
      : [];

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Payments</h1>

      <div className="bill-toolbar">
        {canCollect && (
          <button className="bill-btn bill-btn--primary" type="button" onClick={openCollectForm}>
            Collect Payment
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bill-success" style={{ marginBottom: '12px' }}>
          {successMsg}
        </div>
      )}

      {showCollect && (
        <form className="bill-form" onSubmit={handleSubmit}>
          <h3 style={{ margin: '0 0 16px', color: '#0a2540', fontSize: '16px' }}>Record Payment</h3>
          {formError && <div className="bill-error">{formError}</div>}

          {!selectedConsumer ? (
            <div>
              <div className="bill-field" style={{ maxWidth: '400px' }}>
                <label>Search Consumer</label>
                <input
                  placeholder="Type account # or name (min 2 chars)..."
                  value={consumerSearch}
                  onChange={(e) => setConsumerSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {filteredConsumers.length > 0 && (
                <table className="bill-table" style={{ maxWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th>Account #</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConsumers.map((c) => (
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
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => selectConsumer(c)}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="bill-form-actions">
                <button type="button" className="bill-btn" onClick={() => setShowCollect(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  background: '#eff8ff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                <strong>{selectedConsumer.accountNumber}</strong> — {selectedConsumer.lastName},{' '}
                {selectedConsumer.firstName}{' '}
                <button
                  type="button"
                  style={{
                    fontSize: '12px',
                    color: '#175cd3',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={() => {
                    setSelectedConsumer(null);
                    setConsumerSearch('');
                  }}
                >
                  Change
                </button>
              </div>

              {unpaidBills.length === 0 ? (
                <div className="bill-empty" style={{ padding: '24px 0' }}>
                  No unpaid bills for this consumer.
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#475467',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Bills to Pay
                  </label>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="bill-table" style={{ marginTop: '6px' }}>
                      <thead>
                        <tr>
                          <th>Bill #</th>
                          <th>Period</th>
                          <th>Total</th>
                          <th>Paid</th>
                          <th>Balance</th>
                          <th>Due</th>
                          <th>Apply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaidBills.map((b) => (
                          <tr key={b.id}>
                            <td className="bill-text-mono">{b.billNumber}</td>
                            <td>{b.billingPeriod.name}</td>
                            <td className="bill-text-mono">{formatPeso(b.totalAmount)}</td>
                            <td className="bill-text-mono">{formatPeso(b.amountPaid)}</td>
                            <td className="bill-text-mono" style={{ fontWeight: 600 }}>
                              {formatPeso(b.balance)}
                            </td>
                            <td>{new Date(b.dueDate).toLocaleDateString()}</td>
                            <td style={{ width: '120px' }}>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={Number(b.balance)}
                                value={allocations.get(b.id) ?? ''}
                                onChange={(e) =>
                                  setAllocationAmount(b.id, parseFloat(e.target.value) || 0)
                                }
                                style={{
                                  width: '100px',
                                  padding: '4px 8px',
                                  fontSize: '13px',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                          <td colSpan={6} style={{ textAlign: 'right' }}>
                            Total Payment:
                          </td>
                          <td className="bill-text-mono">{formatPeso(totalAllocation)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="bill-field">
                  <label>OR Number *</label>
                  <input
                    required
                    value={orNumber}
                    onChange={(e) => setOrNumber(e.target.value)}
                    className="bill-text-mono"
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
                  <label>Payment Method *</label>
                  <select
                    required
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="online">Online</option>
                    <option value="bank_deposit">Bank Deposit</option>
                  </select>
                </div>
              </div>

              {paymentMethod === 'check' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="bill-field">
                    <label>Check Number</label>
                    <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
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

              {(paymentMethod === 'online' || paymentMethod === 'bank_deposit') && (
                <div className="bill-field" style={{ maxWidth: '300px' }}>
                  <label>Reference Number</label>
                  <input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>
              )}

              <div className="bill-field" style={{ maxWidth: '400px' }}>
                <label>Remarks</label>
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="bill-form-actions">
                <button type="button" className="bill-btn" onClick={() => setShowCollect(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bill-btn bill-btn--primary"
                  disabled={saving || totalAllocation <= 0}
                >
                  {saving ? 'Processing...' : `Record Payment (${formatPeso(totalAllocation)})`}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {payments.status === 'loading' && <p>Loading payments...</p>}
      {payments.status === 'error' && <div className="bill-error">{payments.message}</div>}
      {payments.status === 'loaded' && payments.data.length === 0 && (
        <div className="bill-empty">No payments recorded yet.</div>
      )}
      {payments.status === 'loaded' && payments.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>OR #</th>
                <th>Date</th>
                <th>Consumer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Bills</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.data.map((p) => (
                <tr key={p.id} style={p.status === 'voided' ? { opacity: 0.5 } : undefined}>
                  <td>
                    <Link
                      to={`/billing/payments/${p.id}`}
                      className="bill-table__link bill-text-mono"
                    >
                      {p.orNumber}
                    </Link>
                  </td>
                  <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                  <td>
                    {p.consumer ? (
                      <Link to={`/billing/consumers/${p.consumerId}`} className="bill-table__link">
                        {p.consumer.accountNumber} — {p.consumer.lastName}, {p.consumer.firstName}
                      </Link>
                    ) : (
                      (p.payerName ?? 'Walk-in')
                    )}
                  </td>
                  <td className="bill-text-mono" style={{ fontWeight: 600 }}>
                    {formatPeso(p.totalAmount)}
                  </td>
                  <td>{p.paymentMethod.replace('_', ' ')}</td>
                  <td className="bill-text-mono">
                    {p.allocations
                      .map((a) => a.bill?.billNumber ?? a.collectionTypeName ?? '—')
                      .join(', ')}
                  </td>
                  <td>
                    <span className={`bill-badge bill-badge--${p.status}`}>{p.status}</span>
                  </td>
                  <td>
                    {canVoid && p.status === 'valid' && voidingId !== p.id && (
                      <button
                        type="button"
                        className="bill-btn bill-btn--danger"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => {
                          setVoidingId(p.id);
                          setVoidReason('');
                        }}
                      >
                        Void
                      </button>
                    )}
                    {voidingId === p.id && (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                          placeholder="Reason..."
                          value={voidReason}
                          onChange={(e) => setVoidReason(e.target.value)}
                          style={{ width: '140px', padding: '3px 6px', fontSize: '12px' }}
                        />
                        <button
                          type="button"
                          className="bill-btn bill-btn--danger"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          onClick={() => handleVoid(p)}
                          disabled={!voidReason.trim()}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="bill-btn"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          onClick={() => setVoidingId('')}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
