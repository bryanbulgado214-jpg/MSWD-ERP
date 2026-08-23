import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError,
  createOtherCollection,
  getCollectibleTypes,
  getConsumers,
  getNextOrNumber,
} from '../api';
import type { CollectibleType, ConsumerListItem } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

function formatPeso(val: number) {
  return (val || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
const today = () => new Date().toISOString().slice(0, 10);
let lineKey = 0;

interface Line {
  key: number;
  collectionTypeId: string;
  amount: string;
}

/**
 * Teller screen for non-bill collections — registration/installation/reconnection/
 * relocation fees, guaranty deposits, advances. The payer can be a walk-in (name
 * only) or a linked consumer. Records a receipt that flows into the day's
 * collection batch and posts to the GL on Cashier finalize.
 */
export default function OtherCollectionPage({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth();
  const canCollect = hasPermission('billing.payment.collect');

  const [types, setTypes] = useState<CollectibleType[]>([]);
  const [consumers, setConsumers] = useState<ConsumerListItem[]>([]);

  const [payerName, setPayerName] = useState('');
  const [applicationRef, setApplicationRef] = useState('');
  const [selected, setSelected] = useState<ConsumerListItem | null>(null);
  const [search, setSearch] = useState('');

  const [lines, setLines] = useState<Line[]>([
    { key: lineKey++, collectionTypeId: '', amount: '' },
  ]);
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
  const [receipt, setReceipt] = useState<{ id: string; orNumber: string; amount: number } | null>(
    null,
  );

  useEffect(() => {
    getCollectibleTypes()
      .then(setTypes)
      .catch(() => {});
    getConsumers('status=active')
      .then(setConsumers)
      .catch(() => {});
    getNextOrNumber()
      .then(({ nextOrNumber }) => setOrNumber(nextOrNumber))
      .catch(() => {});
  }, []);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return consumers
      .filter(
        (c) =>
          c.accountNumber.toLowerCase().includes(q) ||
          `${c.lastName}, ${c.firstName}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [consumers, search]);

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { key: lineKey++, collectionTypeId: '', amount: '' }]);
  }
  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function selectConsumer(c: ConsumerListItem) {
    setSelected(c);
    setPayerName(`${c.lastName}, ${c.firstName}`);
    setSearch('');
  }
  function clearConsumer() {
    setSelected(null);
    setSearch('');
  }

  async function resetForm() {
    setLines([{ key: lineKey++, collectionTypeId: '', amount: '' }]);
    setPayerName('');
    setApplicationRef('');
    setSelected(null);
    setSearch('');
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

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const allocs = lines
      .filter((l) => l.collectionTypeId && parseFloat(l.amount) > 0)
      .map((l) => ({ collectionTypeId: l.collectionTypeId, amountApplied: parseFloat(l.amount) }));
    if (allocs.length === 0) {
      setError('Add at least one collection line with a type and amount.');
      return;
    }
    const needsConsumer = allocs.some((a) => typeById.get(a.collectionTypeId)?.requiresConsumer);
    if (needsConsumer && !selected) {
      setError('One of the selected types must be linked to a consumer account.');
      return;
    }
    if (!selected && !payerName.trim()) {
      setError('Enter the payer name.');
      return;
    }
    setSaving(true);
    try {
      const created = await createOtherCollection({
        orNumber,
        paymentDate,
        totalAmount: Math.round(total * 100) / 100,
        paymentMethod: method,
        ...(selected ? { consumerId: selected.id } : {}),
        ...(payerName.trim() ? { payerName: payerName.trim() } : {}),
        ...(applicationRef ? { applicationRef } : {}),
        ...(method === 'check' && checkNumber ? { checkNumber } : {}),
        ...(method === 'check' && checkDate ? { checkDate } : {}),
        ...(method === 'check' && bankName ? { bankName } : {}),
        ...((method === 'online' || method === 'bank_deposit') && referenceNumber
          ? { referenceNumber }
          : {}),
        ...(remarks ? { remarks } : {}),
        allocations: allocs,
      });
      setSuccess(`Collection ${created.orNumber} recorded — ${formatPeso(total)}.`);
      setReceipt({ id: created.id, orNumber: created.orNumber, amount: total });
      await resetForm();
    } catch (err) {
      setError(err instanceof BillingApiError ? err.message : 'Failed to record collection.');
    } finally {
      setSaving(false);
    }
  }

  const inner = (
    <>
      <p style={{ color: '#667085', fontSize: 13, maxWidth: 720, margin: '0 0 12px' }}>
        Collect non-bill payments — registration, installation, reconnection, and relocation fees,
        guaranty deposits, and advances — from a walk-in or a linked consumer. Issues an OR that
        joins the day&apos;s collection batch.
      </p>

      {!canCollect ? (
        <div className="bill-empty">You do not have permission to accept payments.</div>
      ) : (
        <form className="bill-form" onSubmit={record} style={{ maxWidth: 760 }}>
          {/* Payer */}
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #eaecf0',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="bill-field">
                <label>Payer Name *</label>
                <input
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Walk-in payer or applicant"
                  disabled={!!selected}
                />
              </div>
              <div className="bill-field">
                <label>Application / Reference No.</label>
                <input
                  value={applicationRef}
                  onChange={(e) => setApplicationRef(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              {selected ? (
                <div style={{ fontSize: 13 }}>
                  Linked account: <span className="bill-text-mono">{selected.accountNumber}</span> —{' '}
                  {selected.lastName}, {selected.firstName}{' '}
                  <button
                    type="button"
                    className="bill-btn"
                    style={{ padding: '2px 8px', fontSize: 12, marginLeft: 6 }}
                    onClick={clearConsumer}
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <div className="bill-field" style={{ maxWidth: 380 }}>
                  <label>Link to consumer account (optional)</label>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search account number or name…"
                  />
                  {matches.length > 0 && (
                    <div
                      style={{
                        border: '1px solid #eaecf0',
                        borderRadius: 6,
                        marginTop: 2,
                        maxHeight: 160,
                        overflowY: 'auto',
                        background: '#fff',
                      }}
                    >
                      {matches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectConsumer(c)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            background: 'transparent',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          <span className="bill-text-mono">{c.accountNumber}</span> — {c.lastName},{' '}
                          {c.firstName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lines */}
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="bill-table">
              <thead>
                <tr>
                  <th>Collection Type</th>
                  <th style={{ width: 140 }}>Amount</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      <select
                        value={l.collectionTypeId}
                        onChange={(e) => setLine(l.key, { collectionTypeId: e.target.value })}
                        style={{ width: '100%' }}
                      >
                        <option value="">— select —</option>
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.nature === 'liability' ? ' (deposit)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.amount}
                        onChange={(e) => setLine(l.key, { amount: e.target.value })}
                        style={{ width: 120, padding: '4px 8px' }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="bill-btn"
                        style={{ padding: '2px 8px' }}
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                        title="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ textAlign: 'right' }}>Total:</td>
                  <td className="bill-text-mono">{formatPeso(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button
            type="button"
            className="bill-btn"
            style={{ marginTop: 4, fontSize: 12 }}
            onClick={addLine}
          >
            + Add line
          </button>

          {/* Payment details */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
          {(method === 'online' || method === 'bank_deposit') && (
            <div className="bill-field" style={{ maxWidth: 320 }}>
              <label>Reference Number</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
          )}

          <div className="bill-field" style={{ maxWidth: 420 }}>
            <label>Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          {error && <div className="bill-error">{error}</div>}
          {success && <div className="bill-success">{success}</div>}

          <div className="bill-form-actions">
            <button
              type="submit"
              className="bill-btn bill-btn--primary"
              disabled={saving || total <= 0}
            >
              {saving ? 'Recording…' : `Record Collection (${formatPeso(total)})`}
            </button>
          </div>
        </form>
      )}

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
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Collection Recorded</h3>
            <p style={{ color: '#475467', margin: 0 }}>
              OR <span className="bill-text-mono">{receipt.orNumber}</span> —{' '}
              <strong>{formatPeso(receipt.amount)}</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22 }}>
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
  );
  if (embedded) return inner;
  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Other Collection</h1>
      {inner}
    </div>
  );
}
