import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { getDv } from '../api';
import type { DisbursementVoucher } from '../types';
import './print-forms.css';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  check: 'MDS Check',
  ada: 'Commercial Check / ADA',
  others: 'Others',
};

function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(num: number): string {
    if (num < 20) return ones[num]!;
    if (num < 100) return tens[Math.floor(num / 10)]! + (num % 10 ? ' ' + ones[num % 10]! : '');
    if (num < 1000) return ones[Math.floor(num / 100)]! + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
    if (num < 1000000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 1000000000) return convert(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + convert(num % 1000000) : '');
    return convert(Math.floor(num / 1000000000)) + ' Billion' + (num % 1000000000 ? ' ' + convert(num % 1000000000) : '');
  }

  const whole = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - whole) * 100);
  let result = convert(whole) + ' Pesos';
  if (cents > 0) result += ' and ' + convert(cents) + ' Centavos';
  else result += ' Only';
  return result;
}

export function PrintDvPage() {
  const { id } = useParams<{ id: string }>();
  const [dv, setDv] = useState<DisbursementVoucher | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getDv(id).then(setDv).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!dv) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const dvDate = new Date(dv.dvDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const netNum = parseFloat(dv.netAmount);
  const amountInWords = numberToWords(netNum);

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet">
        {/* Header */}
        <table className="gov-table gov-table--bordered" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', border: 'none', padding: '4px 8px', verticalAlign: 'top' }}>
                <div className="gov-entity" style={{ fontSize: 11, marginBottom: 0 }}>METRO SIQUIJOR WATER DISTRICT</div>
                <div className="gov-subtitle" style={{ fontSize: 9 }}>Siquijor, Siquijor</div>
              </td>
              <td style={{ width: '50%', border: 'none', padding: '4px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                <div style={{ fontSize: 9, color: '#667085' }}>Appendix 32</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="gov-title" style={{ fontSize: 14, margin: '4px 0 8px', letterSpacing: 3 }}>DISBURSEMENT VOUCHER</div>

        {/* Top info section */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '15%', fontWeight: 700, fontSize: 9 }}>Fund Cluster:</td>
              <td style={{ width: '35%', fontSize: 10 }}>{dv.fundSource ? `${dv.fundSource.code} — ${dv.fundSource.name}` : '—'}</td>
              <td style={{ width: '15%', fontWeight: 700, fontSize: 9 }}>Date:</td>
              <td style={{ width: '15%', fontSize: 10 }}>{dvDate}</td>
              <td style={{ width: '10%', fontWeight: 700, fontSize: 9 }}>DV No.:</td>
              <td style={{ width: '10%', fontSize: 10, fontWeight: 700 }}>{dv.dvNumber}</td>
            </tr>
          </tbody>
        </table>

        {/* Mode of Payment */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '20%', fontWeight: 700, fontSize: 9, verticalAlign: 'middle' }}>Mode of Payment:</td>
              <td style={{ fontSize: 10 }}>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span>
                    <span className="gov-checkbox">{dv.paymentMode === 'check' ? '☑' : '☐'}</span> MDS Check
                  </span>
                  <span>
                    <span className="gov-checkbox">{dv.paymentMode === 'ada' ? '☑' : '☐'}</span> Commercial Check / ADA
                  </span>
                  <span>
                    <span className="gov-checkbox">{dv.paymentMode === 'others' ? '☑' : '☐'}</span> Others
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Payee and Address */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '15%', fontWeight: 700, fontSize: 9 }}>Payee:</td>
              <td style={{ width: '45%', fontSize: 11, fontWeight: 600 }}>{dv.supplier.name}</td>
              <td style={{ width: '10%', fontWeight: 700, fontSize: 9 }}>TIN/ID No.:</td>
              <td style={{ width: '30%', fontSize: 10 }}>{dv.supplier.tin ?? '—'}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, fontSize: 9 }}>ORS/BURS No.:</td>
              <td style={{ fontSize: 10 }}>{dv.ors.orsNumber}</td>
              <td style={{ fontWeight: 700, fontSize: 9 }}>Address:</td>
              <td style={{ fontSize: 10 }}>—</td>
            </tr>
          </tbody>
        </table>

        {/* Particulars */}
        <table className="gov-table gov-table--bordered" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '15%', fontSize: 9 }}>Responsibility Center</th>
              <th style={{ fontSize: 9 }}>Particulars</th>
              <th style={{ width: '15%', fontSize: 9 }}>MFO/PAP</th>
              <th style={{ width: '18%', fontSize: 9, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="gov-center" style={{ fontSize: 10, verticalAlign: 'top' }}>
                {dv.responsibilityCenter ? dv.responsibilityCenter.code : '—'}
              </td>
              <td style={{ fontSize: 10, verticalAlign: 'top', minHeight: 80 }}>
                <div style={{ whiteSpace: 'pre-wrap', minHeight: 60 }}>{dv.particulars}</div>
                <div style={{ marginTop: 8, fontSize: 9, color: '#667085' }}>
                  PR: {dv.purchaseRequest.prNumber} — {dv.purchaseRequest.title}
                </div>
                <div style={{ fontSize: 9, color: '#667085' }}>
                  PO: {dv.purchaseOrder.poNumber}
                </div>
                {dv.inspectionReport && (
                  <div style={{ fontSize: 9, color: '#667085' }}>
                    IR: {dv.inspectionReport.reportNumber} ({dv.inspectionReport.overallResult})
                  </div>
                )}
              </td>
              <td className="gov-center" style={{ fontSize: 10, verticalAlign: 'top' }}>
                {dv.accountCode ?? '—'}
              </td>
              <td className="gov-right gov-mono" style={{ fontSize: 11, verticalAlign: 'top' }}>
                {formatPeso(dv.grossAmount)}
              </td>
            </tr>
            {/* Deductions */}
            {parseFloat(dv.taxAmount) > 0 && (
              <tr>
                <td></td>
                <td style={{ fontSize: 10, paddingLeft: 24 }}>Less: Withholding Tax</td>
                <td></td>
                <td className="gov-right gov-mono" style={{ fontSize: 10, color: '#b42318' }}>
                  ({formatPeso(dv.taxAmount)})
                </td>
              </tr>
            )}
            {parseFloat(dv.otherDeductions) > 0 && (
              <tr>
                <td></td>
                <td style={{ fontSize: 10, paddingLeft: 24 }}>Less: Other Deductions</td>
                <td></td>
                <td className="gov-right gov-mono" style={{ fontSize: 10, color: '#b42318' }}>
                  ({formatPeso(dv.otherDeductions)})
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Amount in Words and Net Amount */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td style={{ width: '82%' }}>
                <span style={{ fontSize: 9, fontWeight: 700 }}>Amount Due: </span>
                <span style={{ fontSize: 10, fontStyle: 'italic' }}>{amountInWords}</span>
              </td>
              <td className="gov-right gov-mono gov-bold" style={{ width: '18%', fontSize: 12 }}>
                {formatPeso(dv.netAmount)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Certification Section A */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', textAlign: 'center', padding: '2px 4px' }}>
                A
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: 9, padding: '6px 8px' }}>
                Certified: Expenses/Cash Advance necessary, lawful and incurred under my direct supervision.
              </td>
            </tr>
            <tr>
              <td style={{ width: '50%', textAlign: 'center', padding: '16px 8px 4px', borderRight: '1px solid #bbb' }}>
                <div className="gov-sig-line" style={{ width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{dv.purchaseRequest.prNumber}</div>
                <div style={{ fontSize: 8, color: '#667085' }}>Printed Name, Designation, and Signature of Supervisor</div>
              </td>
              <td style={{ width: '50%', textAlign: 'center', padding: '16px 8px 4px' }}>
                <div style={{ fontSize: 9, color: '#667085' }}>Date</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Certification Section B - Accounting */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', textAlign: 'center', padding: '2px 4px' }}>
                B
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: 9, padding: '4px 8px' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span><span className="gov-checkbox">☑</span> Supporting documents complete and amount claimed proper</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ width: '50%', textAlign: 'center', padding: '16px 8px 4px', borderRight: '1px solid #bbb' }}>
                <div className="gov-sig-line" style={{ width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{dv.certifier?.username?.toUpperCase() ?? ''}</div>
                <div style={{ fontSize: 8, color: '#667085' }}>Printed Name, Designation, and Signature of Accounting Head/Authorized Representative</div>
              </td>
              <td style={{ width: '50%', textAlign: 'center', padding: '16px 8px 4px' }}>
                <div style={{ fontSize: 9 }}>
                  {dv.certifiedAt ? new Date(dv.certifiedAt).toLocaleDateString('en-PH') : ''}
                </div>
                <div style={{ fontSize: 8, color: '#667085' }}>Date</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Section C - Approval */}
        <table className="gov-table gov-table--bordered gov-table--compact" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', textAlign: 'center', padding: '2px 4px' }}>
                C
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: 9, padding: '4px 8px' }}>
                Approved for Payment: {formatPeso(dv.netAmount)}
              </td>
            </tr>
            <tr>
              <td style={{ width: '50%', textAlign: 'center', padding: '16px 8px 4px', borderRight: '1px solid #bbb' }}>
                <div className="gov-sig-line" style={{ width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{dv.approver?.username?.toUpperCase() ?? ''}</div>
                <div style={{ fontSize: 8, color: '#667085' }}>Agency Head / Authorized Representative</div>
              </td>
              <td style={{ width: '50%', textAlign: 'center', padding: '16px 8px 4px' }}>
                <div style={{ fontSize: 9 }}>
                  {dv.approvedAt ? new Date(dv.approvedAt).toLocaleDateString('en-PH') : ''}
                </div>
                <div style={{ fontSize: 8, color: '#667085' }}>Date</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Section D - Receipt */}
        <table className="gov-table gov-table--bordered gov-table--compact">
          <tbody>
            <tr>
              <td colSpan={4} style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', textAlign: 'center', padding: '2px 4px' }}>
                D
              </td>
            </tr>
            <tr>
              <td style={{ width: '15%', fontSize: 9, fontWeight: 700, borderRight: '1px solid #bbb' }}>
                Check / ADA No.:
              </td>
              <td style={{ width: '25%', fontSize: 10, borderRight: '1px solid #bbb' }}>
                {dv.checkNumber ?? ''}
              </td>
              <td style={{ width: '10%', fontSize: 9, fontWeight: 700, borderRight: '1px solid #bbb' }}>Date:</td>
              <td style={{ width: '20%', fontSize: 10 }}>
                {dv.checkDate ? new Date(dv.checkDate).toLocaleDateString('en-PH') : ''}
              </td>
            </tr>
            <tr>
              <td style={{ fontSize: 9, fontWeight: 700, borderRight: '1px solid #bbb' }}>Bank Name:</td>
              <td colSpan={3} style={{ fontSize: 10 }}>{dv.bankName ?? ''}</td>
            </tr>
            <tr>
              <td colSpan={4} style={{ fontSize: 9, padding: '6px 8px' }}>
                Payment received by: _____________________________ Date: _____________ Signature: _____________
              </td>
            </tr>
          </tbody>
        </table>

        {/* Print-only footer */}
        <div className="gov-print-footer">
          <div style={{ fontSize: 8, color: '#98a2b3' }}>
            Printed: {new Date().toLocaleString('en-PH')} | {dv.dvNumber}
          </div>
        </div>
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
