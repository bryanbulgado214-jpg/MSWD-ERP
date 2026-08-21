import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getPostableAccounts, type PostableAccount } from '../../accounting/api';
import { AccountCombobox } from '../../accounting/pages/AccountCombobox';
import { formatPeso } from '../../budgeting/format-peso';
import { createDv, listOrs, ProcurementApiError } from '../api';
import type { Ors } from '../types';
import './procurement.css';

interface DeductionRow {
  key: string;
  label: string;
  chartOfAccountId: string;
  amount: string;
}

export function NewDvPage() {
  const navigate = useNavigate();
  const [orsList, setOrsList] = useState<Ors[]>([]);
  const [selectedOrsId, setSelectedOrsId] = useState('');
  const [particulars, setParticulars] = useState('');
  const [paymentMode, setPaymentMode] = useState<'check' | 'ada' | 'others'>('check');
  const [grossAmount, setGrossAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [postable, setPostable] = useState<PostableAccount[]>([]);
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>([]);
  const rowSeq = useRef(0);
  const [accountCode, setAccountCode] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listOrs({ status: 'obligated' })
      .then(setOrsList)
      .catch(() => {});
    getPostableAccounts()
      .then(setPostable)
      .catch(() => {});
  }, []);

  function addDeduction() {
    rowSeq.current += 1;
    setDeductionRows((rows) => [
      ...rows,
      { key: `d${rowSeq.current}`, label: '', chartOfAccountId: '', amount: '' },
    ]);
  }
  function updateDeduction(key: string, patch: Partial<DeductionRow>) {
    setDeductionRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeDeduction(key: string) {
    setDeductionRows((rows) => rows.filter((r) => r.key !== key));
  }

  const selectedOrs = orsList.find((o) => o.id === selectedOrsId);

  function handleOrsChange(orsId: string) {
    setSelectedOrsId(orsId);
    const ors = orsList.find((o) => o.id === orsId);
    if (ors) {
      setGrossAmount(String(ors.originalAmount));
      setParticulars(
        `Payment for ${ors.purchaseRequest.title} per PO ${ors.purchaseOrder?.poNumber ?? 'N/A'}`,
      );
    }
  }

  const gross = parseFloat(grossAmount) || 0;
  const tax = parseFloat(taxAmount) || 0;
  const deductionsTotal = deductionRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const net = gross - tax - deductionsTotal;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrsId) {
      setError('Select an Obligation Request.');
      return;
    }
    if (!particulars.trim()) {
      setError('Particulars are required.');
      return;
    }
    if (gross <= 0) {
      setError('Gross amount must be greater than zero.');
      return;
    }

    const deductionPayload = deductionRows
      .map((r) => ({
        label: r.label.trim(),
        chartOfAccountId: r.chartOfAccountId,
        amount: parseFloat(r.amount) || 0,
      }))
      .filter((r) => r.amount > 0);
    if (deductionPayload.some((r) => !r.label || !r.chartOfAccountId)) {
      setError('Each deduction line needs a description, a credit account, and an amount.');
      return;
    }
    if (net < 0) {
      setError('Tax and deductions cannot exceed the gross amount.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const dv = await createDv({
        orsId: selectedOrsId,
        particulars,
        grossAmount: gross,
        paymentMode,
        ...(tax > 0 ? { taxAmount: tax } : {}),
        ...(deductionPayload.length ? { deductions: deductionPayload } : {}),
        ...(accountCode ? { accountCode } : {}),
        ...(checkNumber ? { checkNumber } : {}),
        ...(checkDate ? { checkDate } : {}),
        ...(bankName ? { bankName } : {}),
      });
      navigate(`/procurement/dvs/${dv.id}`);
    } catch (e) {
      setError(e instanceof ProcurementApiError ? e.message : 'Failed to create DV.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pr-page">
      <h1>New Disbursement Voucher</h1>
      {error && <div className="pr-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="pr-form-field" style={{ gridColumn: '1 / -1' }}>
            <label>Obligation Request (ORS) *</label>
            <select
              value={selectedOrsId}
              onChange={(e) => handleOrsChange(e.target.value)}
              required
              style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
            >
              <option value="">Select an ORS...</option>
              {orsList.map((ors) => (
                <option key={ors.id} value={ors.id}>
                  {ors.orsNumber} — {ors.supplier?.name ?? 'N/A'} — {formatPeso(ors.originalAmount)}
                </option>
              ))}
            </select>
          </div>

          {selectedOrs && (
            <div
              style={{
                gridColumn: '1 / -1',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
              }}
            >
              <strong>ORS: {selectedOrs.orsNumber}</strong>
              {' — PR: '}
              {selectedOrs.purchaseRequest.prNumber} — {selectedOrs.purchaseRequest.title}
              {selectedOrs.purchaseOrder && (
                <span> — PO: {selectedOrs.purchaseOrder.poNumber}</span>
              )}
              {' — Amount: '}
              {formatPeso(selectedOrs.originalAmount)}
            </div>
          )}

          <div className="pr-form-field" style={{ gridColumn: '1 / -1' }}>
            <label>Particulars *</label>
            <textarea
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="pr-form-field">
            <label>Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as 'check' | 'ada' | 'others')}
            >
              <option value="check">Check</option>
              <option value="ada">Advice to Debit Account (ADA)</option>
              <option value="others">Others</option>
            </select>
          </div>
          <div className="pr-form-field">
            <label>Account Code</label>
            <input
              type="text"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              maxLength={30}
            />
          </div>
        </div>

        {/* Financial */}
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 8px' }}>Financial Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="pr-form-field">
            <label>Gross Amount *</label>
            <input
              type="number"
              step="0.01"
              value={grossAmount}
              onChange={(e) => setGrossAmount(e.target.value)}
              required
            />
          </div>
          <div className="pr-form-field">
            <label>Tax Withheld (BIR)</label>
            <input
              type="number"
              step="0.01"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Other deductions — free-form; each is credited to its own account */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <label style={{ fontWeight: 600, fontSize: 13 }}>Other Deductions</label>
            <button
              type="button"
              className="pr-btn"
              onClick={addDeduction}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              + Add deduction
            </button>
          </div>

          {deductionRows.length === 0 ? (
            <div style={{ color: '#98a2b3', fontSize: 12, padding: '4px 0' }}>
              None. BIR withholding goes in &ldquo;Tax Withheld&rdquo; above; add retention or other
              withholdings here — each is credited to its own liability account when the DV is
              released.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 1.7fr 0.9fr 30px',
                  gap: 8,
                  fontSize: 11,
                  color: '#667085',
                  fontWeight: 600,
                }}
              >
                <span>Description</span>
                <span>Credit account</span>
                <span>Amount</span>
                <span />
              </div>
              {deductionRows.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.3fr 1.7fr 0.9fr 30px',
                    gap: 8,
                    alignItems: 'start',
                  }}
                >
                  <input
                    type="text"
                    placeholder="e.g. Retention 10%"
                    value={r.label}
                    maxLength={120}
                    onChange={(e) => updateDeduction(r.key, { label: e.target.value })}
                    style={{
                      padding: '7px 9px',
                      border: '1px solid #d0d5dd',
                      borderRadius: 6,
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                  <AccountCombobox
                    accounts={postable}
                    value={r.chartOfAccountId}
                    onChange={(id) => updateDeduction(r.key, { chartOfAccountId: id })}
                    placeholder="Search liability / payable account…"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={r.amount}
                    onChange={(e) => updateDeduction(r.key, { amount: e.target.value })}
                    style={{
                      padding: '7px 9px',
                      border: '1px solid #d0d5dd',
                      borderRadius: 6,
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeDeduction(r.key)}
                    title="Remove deduction"
                    style={{
                      border: '1px solid #fecdca',
                      color: '#b42318',
                      background: '#fff',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  fontSize: 12,
                  color: '#475467',
                }}
              >
                <span>Total deductions:</span>
                <strong>{formatPeso(deductionsTotal)}</strong>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, color: '#0f172a' }}>Net Amount Payable:</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#067647' }}>{formatPeso(net)}</span>
        </div>

        {/* Check details */}
        {paymentMode === 'check' && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 8px' }}>
              Check Details (Optional)
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div className="pr-form-field">
                <label>Check Number</label>
                <input
                  type="text"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  maxLength={50}
                />
              </div>
              <div className="pr-form-field">
                <label>Check Date</label>
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                />
              </div>
              <div className="pr-form-field">
                <label>Bank Name</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button type="submit" className="pr-btn pr-btn--primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Disbursement Voucher'}
          </button>
          <button type="button" className="pr-btn" onClick={() => navigate('/procurement/dvs')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
