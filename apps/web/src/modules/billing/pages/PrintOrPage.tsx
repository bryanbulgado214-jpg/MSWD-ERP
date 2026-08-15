import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { GovLetterhead } from '../../../app/GovLetterhead';
import { getPayment } from '../api';
import type { Payment } from '../types';
import './print-billing.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  function convert(num: number): string {
    if (num < 20) return ones[num]!;
    if (num < 100) return tens[Math.floor(num / 10)]! + (num % 10 ? ' ' + ones[num % 10]! : '');
    if (num < 1000)
      return (
        ones[Math.floor(num / 100)]! + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '')
      );
    if (num < 1000000)
      return (
        convert(Math.floor(num / 1000)) +
        ' Thousand' +
        (num % 1000 ? ' ' + convert(num % 1000) : '')
      );
    if (num < 1000000000)
      return (
        convert(Math.floor(num / 1000000)) +
        ' Million' +
        (num % 1000000 ? ' ' + convert(num % 1000000) : '')
      );
    return (
      convert(Math.floor(num / 1000000000)) +
      ' Billion' +
      (num % 1000000000 ? ' ' + convert(num % 1000000000) : '')
    );
  }

  const whole = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - whole) * 100);
  let result = convert(whole) + ' Pesos';
  if (cents > 0) result += ' and ' + convert(cents) + ' Centavos';
  else result += ' Only';
  return result;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online Payment',
  bank_deposit: 'Bank Deposit',
};

export default function PrintOrPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getPayment(id)
      .then(setPayment)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!payment) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const payDate = new Date(payment.paymentDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const totalNum =
    typeof payment.totalAmount === 'string' ? parseFloat(payment.totalAmount) : payment.totalAmount;
  const amountInWords = numberToWords(totalNum);
  const consumerName = `${payment.consumer.lastName}, ${payment.consumer.firstName}`;

  return (
    <div className="bill-print-page">
      <div className="bill-print-controls">
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      <div className="bill-print-sheet bill-print-sheet--half">
        <div className="bill-print-header">
          <GovLetterhead
            entityClass="bill-print-header__entity"
            subClass="bill-print-header__sub"
          />
          <p className="bill-print-header__title">Official Receipt</p>
        </div>

        <hr className="bill-print-divider" />

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">OR No:</span>
            <span>{payment.orNumber}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Date:</span>
            <span>{payDate}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Received from:</span>
            <span>{consumerName}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Account No:</span>
            <span>{payment.consumer.accountNumber}</span>
          </div>
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Address:</span>
            <span>{payment.consumer.address}</span>
          </div>
        </div>

        <div className="bill-print-info">
          <div className="bill-print-info__group">
            <span className="bill-print-info__label">Payment Method:</span>
            <span>{METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</span>
          </div>
          {payment.checkNumber && (
            <div className="bill-print-info__group">
              <span className="bill-print-info__label">Check No:</span>
              <span>{payment.checkNumber}</span>
            </div>
          )}
        </div>

        <table className="bill-print-table">
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Period</th>
              <th style={{ textAlign: 'right' }}>Amount Applied</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((a) => (
              <tr key={a.id}>
                <td className="bp-center">{a.bill.billNumber}</td>
                <td className="bp-center">{a.bill.billingPeriod?.name ?? '—'}</td>
                <td className="bp-right">{formatPeso(a.amountApplied)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>
                TOTAL
              </td>
              <td className="bp-right" style={{ fontWeight: 700 }}>
                {formatPeso(payment.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="bill-print-words">
          <strong>Amount in Words:</strong> {amountInWords}
        </div>

        {payment.remarks && (
          <div style={{ margin: '8px 0', fontSize: '10pt' }}>
            <strong>Remarks:</strong> {payment.remarks}
          </div>
        )}

        {payment.status === 'voided' && (
          <div
            style={{
              textAlign: 'center',
              margin: '16px 0',
              padding: '8px',
              border: '3px solid #b42318',
              color: '#b42318',
              fontWeight: 700,
              fontSize: '18pt',
              letterSpacing: '4px',
            }}
          >
            VOIDED
          </div>
        )}

        <div className="bill-print-sig">
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Received by:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__name">{payment.cashier?.username ?? ''}</div>
            <div className="bill-print-sig__title">Cashier</div>
          </div>
          <div className="bill-print-sig__col">
            <p style={{ fontSize: '10pt', marginBottom: 4 }}>Payor:</p>
            <div className="bill-print-sig__line"></div>
            <div className="bill-print-sig__title">Signature over Printed Name</div>
          </div>
        </div>

        <div className="bill-print-footer">
          This is a computer-generated receipt. Keep this for your records.
        </div>
      </div>
    </div>
  );
}
