import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { GovLetterhead } from '../../../app/GovLetterhead';
import { signatoryFor } from '../../../app/signatories';
import { AccountingApiError, getCheck } from '../api';
import type { CheckDetail } from '../types';
import '../../procurement/pages/print-forms.css';

function numberToWords(n: number): string {
  if (n === 0) return 'Zero Pesos Only';
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
  let r = convert(whole) + ' Pesos';
  r += cents > 0 ? ' and ' + convert(cents) + ' Centavos' : ' Only';
  return r;
}

function peso(v: string): string {
  return parseFloat(v).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export function PrintCheckPage() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useAuth();
  const authSig = signatoryFor(organization?.signatories, 'check', 'authorized');
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getCheck(id)
      .then(setCheck)
      .catch((e) => setError(e instanceof AccountingApiError ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!check) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const dateStr = new Date(check.checkDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet" style={{ maxWidth: 720 }}>
        {/* Bank / entity header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '2px solid #101828',
            paddingBottom: 8,
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{check.bankAccount.bank.name}</div>
            <div style={{ fontSize: 10, color: '#475467' }}>
              {check.bankAccount.accountName} · Acct. No. {check.bankAccount.accountNumber}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: '#98a2b3' }}>
              <GovLetterhead
                entityStyle={{ fontSize: 10, marginBottom: 0 }}
                subStyle={{ fontSize: 8 }}
              />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 700 }}>Check No.</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace' }}>
              {check.checkNumber ?? '—'}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700 }}>Date</div>
            <div style={{ fontSize: 12 }}>{dateStr}</div>
          </div>
        </div>

        {/* Pay line */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td style={{ width: '18%', fontSize: 10, fontWeight: 700 }}>Pay to the order of:</td>
              <td style={{ fontSize: 13, fontWeight: 700 }}>{check.payeeName}</td>
              <td
                style={{
                  width: '20%',
                  textAlign: 'right',
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                }}
              >
                {peso(check.amount)}
              </td>
            </tr>
            <tr>
              <td style={{ fontSize: 10, fontWeight: 700 }}>The sum of:</td>
              <td colSpan={2} style={{ fontSize: 11, fontStyle: 'italic' }}>
                {numberToWords(parseFloat(check.amount))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* MICR-ish line */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 8,
            borderTop: '1px dashed #98a2b3',
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#475467',
          }}
        >
          <span>⑈ {check.checkNumber ?? '••••••'} ⑈</span>
          <span>{check.bankAccount.accountNumber}</span>
          <span style={{ textAlign: 'center' }}>
            {authSig?.name ? (
              <span style={{ display: 'block', fontWeight: 700 }}>
                {authSig.name.toUpperCase()}
              </span>
            ) : null}
            <span style={{ display: 'block' }}>
              Authorized Signature{authSig?.name ? '' : ' ______________________'}
            </span>
            {authSig?.title ? (
              <span style={{ display: 'block', fontSize: 9 }}>{authSig.title}</span>
            ) : null}
          </span>
        </div>

        {/* Supporting reference */}
        <div style={{ marginTop: 20, fontSize: 9, color: '#98a2b3' }}>
          Supported by Disbursement Voucher {check.disbursementVoucher?.dvNumber ?? '—'} · Status:{' '}
          {check.status}
          {' · '}Printed: {new Date().toLocaleString('en-PH')}
        </div>
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
