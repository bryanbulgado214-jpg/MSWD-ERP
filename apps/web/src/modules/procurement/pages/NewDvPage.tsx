import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { createDv, listOrs, ProcurementApiError } from '../api';
import type { Ors } from '../types';
import './procurement.css';

export function NewDvPage() {
  const navigate = useNavigate();
  const [orsList, setOrsList] = useState<Ors[]>([]);
  const [selectedOrsId, setSelectedOrsId] = useState('');
  const [particulars, setParticulars] = useState('');
  const [paymentMode, setPaymentMode] = useState<'check' | 'ada' | 'others'>('check');
  const [grossAmount, setGrossAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [otherDeductions, setOtherDeductions] = useState('0');
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
  }, []);

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
  const deductions = parseFloat(otherDeductions) || 0;
  const net = gross - tax - deductions;

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

    setSubmitting(true);
    setError('');
    try {
      const dv = await createDv({
        orsId: selectedOrsId,
        particulars,
        grossAmount: gross,
        paymentMode,
        ...(tax > 0 ? { taxAmount: tax } : {}),
        ...(deductions > 0 ? { otherDeductions: deductions } : {}),
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
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}
        >
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
            <label>Tax Withheld</label>
            <input
              type="number"
              step="0.01"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </div>
          <div className="pr-form-field">
            <label>Other Deductions</label>
            <input
              type="number"
              step="0.01"
              value={otherDeductions}
              onChange={(e) => setOtherDeductions(e.target.value)}
            />
          </div>
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
