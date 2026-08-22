import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { GovLetterhead } from '../../../app/GovLetterhead';
import { getPayment } from '../api';
import type { Payment } from '../types';
import './print-billing.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online Payment',
  bank_deposit: 'Bank Deposit',
};

/**
 * PLACEHOLDER invoice template.
 *
 * This is a stand-in layout so the print-invoice flow works end-to-end. The
 * water district's actual invoice template will be dropped in later — only the
 * markup inside `.bill-print-sheet` below needs to change; the data plumbing
 * (payment lookup, controls, auto-print) stays the same.
 */
export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const printedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    getPayment(id)
      .then(setPayment)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [id]);

  // Auto-open the print dialog once the invoice has rendered, since this page is
  // opened specifically to be printed.
  useEffect(() => {
    if (payment && !printedRef.current) {
      printedRef.current = true;
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [payment]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!payment) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const invoiceDate = new Date(payment.paymentDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const consumerName = `${payment.consumer.lastName}, ${payment.consumer.firstName}`;
  // The allocation lines cover principal only; any excess of the total over the
  // principal is the 10% late-payment penalty, shown as its own line so the
  // invoice reconciles to the amount collected.
  const principalSum = payment.allocations.reduce((s, a) => s + Number(a.amountApplied), 0);
  const penaltyAmount = Math.round((Number(payment.totalAmount) - principalSum) * 100) / 100;

  return (
    <div className="bill-print-page">
      <div className="bill-print-controls">
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <div className="bill-print-sheet">
        {/* PLACEHOLDER banner — remove once the real template is supplied. */}
        <div
          style={{
            border: '1px dashed #b42318',
            background: '#fff4f3',
            color: '#b42318',
            textAlign: 'center',
            fontSize: '9pt',
            fontWeight: 700,
            letterSpacing: '1px',
            padding: '4px',
            marginBottom: '12px',
          }}
        >
          PLACEHOLDER TEMPLATE — FINAL INVOICE LAYOUT TO BE PROVIDED
        </div>

        <div className="bill-print-header">
          <GovLetterhead
            entityClass="bill-print-header__entity"
            subClass="bill-print-header__sub"
          />
          <p className="bill-print-header__title">Service Invoice</p>
        </div>

        <hr className="bill-print-divider" />

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Invoice No:</span>
            <span>{payment.orNumber}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Date:</span>
            <span>{invoiceDate}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Bill To:</span>
            <span>{consumerName}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Account No:</span>
            <span>{payment.consumer.accountNumber}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Address:</span>
            <span>{payment.consumer.address}</span>
          </div>
        </div>

        <table className="bill-print-table">
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Period</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((a) => (
              <tr key={a.id}>
                <td className="bp-center">{a.bill.billNumber}</td>
                <td className="bp-center">{a.bill.billingPeriod?.name ?? '—'}</td>
                <td>Water service charge</td>
                <td className="bp-right">{formatPeso(a.amountApplied)}</td>
              </tr>
            ))}
            {penaltyAmount > 0.005 && (
              <tr>
                <td className="bp-center">—</td>
                <td className="bp-center">—</td>
                <td>Penalty — 10% on overdue bills</td>
                <td className="bp-right">{formatPeso(penaltyAmount)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>
                TOTAL
              </td>
              <td className="bp-right" style={{ fontWeight: 700 }}>
                {formatPeso(payment.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="bill-print-info" style={{ marginTop: '12px' }}>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Payment Method:</span>
            <span>{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">OR No:</span>
            <span>{payment.orNumber}</span>
          </div>
        </div>

        {payment.remarks && (
          <div style={{ margin: '8px 0', fontSize: '10pt' }}>
            <strong>Remarks:</strong> {payment.remarks}
          </div>
        )}

        <div className="bill-print-sig">
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Prepared by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__name">{payment.cashier?.username ?? ''}</div>
            <div className="bill-print-sig__title">Cashier</div>
          </div>
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Received by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__title">Signature over Printed Name</div>
          </div>
        </div>

        <div className="bill-print-footer">
          This is a computer-generated invoice. Keep this for your records.
        </div>
      </div>
    </div>
  );
}
