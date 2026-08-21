import { formatPeso } from '../modules/budgeting/format-peso';

import { GovLetterhead } from './GovLetterhead';
import '../modules/procurement/pages/print-forms.css';

// Structural shape shared by the procurement DV (always has a supplier + PR/PO/
// ORS) and the accounting DV (non-procurement: a free-text payee, no chain).
export interface DvSheetData {
  dvNumber: string;
  dvDate: string;
  dvType?: string | null;
  particulars: string;
  paymentMode: string;
  grossAmount: string;
  taxAmount: string;
  otherDeductions: string;
  deductions?: Array<{
    label: string;
    amount: string;
    chartOfAccount?: { accountCode: string; name: string } | null;
  }> | null;
  netAmount: string;
  accountCode?: string | null;
  checkNumber?: string | null;
  checkDate?: string | null;
  bankName?: string | null;
  certifiedAt?: string | null;
  approvedAt?: string | null;
  payeeName?: string | null;
  payeeTin?: string | null;
  payeeAddress?: string | null;
  ors?: { orsNumber: string } | null;
  purchaseRequest?: { prNumber: string; title: string } | null;
  purchaseOrder?: { poNumber: string } | null;
  inspectionReport?: { reportNumber: string; overallResult: string } | null;
  supplier?: { name: string; tin: string | null; address: string | null } | null;
  fundSource?: { code: string; name: string } | null;
  responsibilityCenter?: { code: string; name: string } | null;
  certifier?: { username: string } | null;
  approver?: { username: string } | null;
  journalEntry?: {
    jevNumber: string;
    lines: Array<{
      debitAmount: string;
      creditAmount: string;
      chartOfAccount: { accountCode: string; name: string };
    }>;
  } | null;
}

const DV_TYPE_LABELS: Record<string, string> = {
  procurement: 'Procurement',
  travel: 'Travel',
  reimbursement: 'Reimbursement',
  payroll: 'Payroll',
  utility: 'Utility',
  other: 'Other',
};

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
  let result = convert(whole) + ' Pesos';
  if (cents > 0) result += ' and ' + convert(cents) + ' Centavos';
  else result += ' Only';
  return result;
}

/**
 * The COA-prescribed Disbursement Voucher (Appendix 32). Renders identically for
 * a procurement DV and a non-procurement (accounting) DV; the payee, particulars
 * references and Box B accounting entry adapt to whichever data is present.
 */
export function DisbursementVoucherSheet({ dv }: { dv: DvSheetData }) {
  const dvDate = new Date(dv.dvDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const amountInWords = numberToWords(parseFloat(dv.netAmount));

  const payeeName = dv.supplier?.name ?? dv.payeeName ?? '—';
  const payeeTin = dv.supplier?.tin ?? dv.payeeTin ?? '—';
  const payeeAddress = dv.supplier?.address ?? dv.payeeAddress ?? '—';
  const typeLabel = dv.dvType ? (DV_TYPE_LABELS[dv.dvType] ?? dv.dvType) : null;

  // Box B is driven by the posted JEV (never re-derived), so it matches the GL.
  const je = dv.journalEntry;
  const jeLines = je?.lines ?? [];
  const jeTotalDebit = jeLines.reduce((s, l) => s + parseFloat(l.debitAmount), 0);
  const jeTotalCredit = jeLines.reduce((s, l) => s + parseFloat(l.creditAmount), 0);

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet">
        {/* Header */}
        <table className="gov-table gov-table--bordered" style={{ marginBottom: 0 }}>
          <tbody>
            <tr>
              <td
                style={{ width: '50%', border: 'none', padding: '4px 8px', verticalAlign: 'top' }}
              >
                <GovLetterhead
                  entityStyle={{ fontSize: 11, marginBottom: 0 }}
                  subStyle={{ fontSize: 9 }}
                />
              </td>
              <td
                style={{
                  width: '50%',
                  border: 'none',
                  padding: '4px 8px',
                  textAlign: 'right',
                  verticalAlign: 'top',
                }}
              >
                <div style={{ fontSize: 9, color: '#667085' }}>Appendix 32</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="gov-title" style={{ fontSize: 14, margin: '4px 0 8px', letterSpacing: 3 }}>
          DISBURSEMENT VOUCHER
        </div>

        {/* Top info section */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td style={{ width: '15%', fontWeight: 700, fontSize: 9 }}>Fund Cluster:</td>
              <td style={{ width: '35%', fontSize: 10 }}>
                {dv.fundSource ? `${dv.fundSource.code} — ${dv.fundSource.name}` : '—'}
              </td>
              <td style={{ width: '15%', fontWeight: 700, fontSize: 9 }}>Date:</td>
              <td style={{ width: '15%', fontSize: 10 }}>{dvDate}</td>
              <td style={{ width: '10%', fontWeight: 700, fontSize: 9 }}>DV No.:</td>
              <td style={{ width: '10%', fontSize: 10, fontWeight: 700 }}>{dv.dvNumber}</td>
            </tr>
          </tbody>
        </table>

        {/* Mode of Payment */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td style={{ width: '20%', fontWeight: 700, fontSize: 9, verticalAlign: 'middle' }}>
                Mode of Payment:
              </td>
              <td style={{ fontSize: 10 }}>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span>
                    <span className="gov-checkbox">{dv.paymentMode === 'check' ? '☑' : '☐'}</span>{' '}
                    MDS Check
                  </span>
                  <span>
                    <span className="gov-checkbox">{dv.paymentMode === 'ada' ? '☑' : '☐'}</span>{' '}
                    Commercial Check / ADA
                  </span>
                  <span>
                    <span className="gov-checkbox">{dv.paymentMode === 'others' ? '☑' : '☐'}</span>{' '}
                    Others
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Payee and Address */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td style={{ width: '15%', fontWeight: 700, fontSize: 9 }}>Payee:</td>
              <td style={{ width: '45%', fontSize: 11, fontWeight: 600 }}>{payeeName}</td>
              <td style={{ width: '10%', fontWeight: 700, fontSize: 9 }}>TIN/ID No.:</td>
              <td style={{ width: '30%', fontSize: 10 }}>{payeeTin}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, fontSize: 9 }}>ORS/BURS No.:</td>
              <td style={{ fontSize: 10 }}>{dv.ors?.orsNumber ?? '—'}</td>
              <td style={{ fontWeight: 700, fontSize: 9 }}>Address:</td>
              <td style={{ fontSize: 10 }}>{payeeAddress}</td>
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
                {dv.purchaseRequest && (
                  <div style={{ marginTop: 8, fontSize: 9, color: '#667085' }}>
                    PR: {dv.purchaseRequest.prNumber} — {dv.purchaseRequest.title}
                  </div>
                )}
                {dv.purchaseOrder && (
                  <div style={{ fontSize: 9, color: '#667085' }}>
                    PO: {dv.purchaseOrder.poNumber}
                  </div>
                )}
                {dv.inspectionReport && (
                  <div style={{ fontSize: 9, color: '#667085' }}>
                    IR: {dv.inspectionReport.reportNumber} ({dv.inspectionReport.overallResult})
                  </div>
                )}
                {!dv.purchaseRequest && typeLabel && (
                  <div style={{ marginTop: 8, fontSize: 9, color: '#667085' }}>
                    Disbursement type: {typeLabel}
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
            {dv.deductions && dv.deductions.length > 0
              ? dv.deductions.map((d, i) => (
                  <tr key={i}>
                    <td></td>
                    <td style={{ fontSize: 10, paddingLeft: 24 }}>Less: {d.label}</td>
                    <td className="gov-center gov-mono" style={{ fontSize: 9 }}>
                      {d.chartOfAccount?.accountCode ?? ''}
                    </td>
                    <td className="gov-right gov-mono" style={{ fontSize: 10, color: '#b42318' }}>
                      ({formatPeso(d.amount)})
                    </td>
                  </tr>
                ))
              : parseFloat(dv.otherDeductions) > 0 && (
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
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
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

        {/* Box A - Certified by requesting/supervising officer */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td
                colSpan={2}
                style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', padding: '2px 6px' }}
              >
                A — Certified
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: 9, padding: '6px 8px' }}>
                Certified: Expenses/Cash Advance necessary, lawful and incurred under my direct
                supervision.
              </td>
            </tr>
            <tr>
              <td
                style={{
                  width: '50%',
                  textAlign: 'center',
                  padding: '20px 8px 4px',
                  borderRight: '1px solid #bbb',
                }}
              >
                <div className="gov-sig-line" style={{ width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 8, color: '#667085' }}>
                  Printed Name, Designation &amp; Signature of Head of Office / Supervisor
                </div>
              </td>
              <td style={{ width: '50%', textAlign: 'center', padding: '20px 8px 4px' }}>
                <div className="gov-sig-line" style={{ width: '50%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 8, color: '#667085' }}>Date</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Box B - Accounting Entry (from the posted JEV) */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td
                colSpan={4}
                style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', padding: '2px 6px' }}
              >
                B — Accounting Entry
                {je && (
                  <span style={{ fontWeight: 400, color: '#667085' }}>
                    {'   '}(per posted {je.jevNumber})
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <thead>
            <tr>
              <th style={{ fontSize: 9, textAlign: 'left' }}>Account Title</th>
              <th style={{ width: '18%', fontSize: 9 }}>UACS Code</th>
              <th style={{ width: '17%', fontSize: 9, textAlign: 'right' }}>Debit</th>
              <th style={{ width: '17%', fontSize: 9, textAlign: 'right' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {jeLines.length > 0 ? (
              jeLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 10 }}>{l.chartOfAccount.name}</td>
                  <td className="gov-center gov-mono" style={{ fontSize: 9 }}>
                    {l.chartOfAccount.accountCode}
                  </td>
                  <td className="gov-right gov-mono" style={{ fontSize: 10 }}>
                    {parseFloat(l.debitAmount) > 0 ? formatPeso(l.debitAmount) : ''}
                  </td>
                  <td className="gov-right gov-mono" style={{ fontSize: 10 }}>
                    {parseFloat(l.creditAmount) > 0 ? formatPeso(l.creditAmount) : ''}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    fontSize: 9,
                    color: '#98a2b3',
                    fontStyle: 'italic',
                    padding: '10px 8px',
                  }}
                >
                  The accounting entry is recorded automatically as a posted journal entry voucher
                  upon release / disbursement of this voucher.
                </td>
              </tr>
            )}
            {jeLines.length > 0 && (
              <tr>
                <td colSpan={2} className="gov-right gov-bold" style={{ fontSize: 9 }}>
                  Total
                </td>
                <td className="gov-right gov-mono gov-bold" style={{ fontSize: 10 }}>
                  {formatPeso(jeTotalDebit)}
                </td>
                <td className="gov-right gov-mono gov-bold" style={{ fontSize: 10 }}>
                  {formatPeso(jeTotalCredit)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Box C - Certified by Head, Accounting Unit / Authorized Representative */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td
                colSpan={2}
                style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', padding: '2px 6px' }}
              >
                C — Certified
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: 9, padding: '6px 8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span>
                    <span className="gov-checkbox">☑</span> Cash available
                  </span>
                  <span>
                    <span className="gov-checkbox">☐</span> Subject to Authority to Debit Account
                    (ADA)
                  </span>
                  <span>
                    <span className="gov-checkbox">☑</span> Supporting documents complete and amount
                    claimed proper
                  </span>
                </div>
              </td>
            </tr>
            <tr>
              <td
                style={{
                  width: '50%',
                  textAlign: 'center',
                  padding: '16px 8px 4px',
                  borderRight: '1px solid #bbb',
                }}
              >
                <div className="gov-sig-line" style={{ width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>
                  {dv.certifier?.username?.toUpperCase() ?? ''}
                </div>
                <div style={{ fontSize: 8, color: '#667085' }}>
                  Printed Name &amp; Signature — Head, Accounting Unit / Authorized Representative
                </div>
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

        {/* Box D - Approved for Payment */}
        <table
          className="gov-table gov-table--bordered gov-table--compact"
          style={{ marginBottom: 0 }}
        >
          <tbody>
            <tr>
              <td
                colSpan={2}
                style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', padding: '2px 6px' }}
              >
                D — Approved for Payment
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ fontSize: 9, padding: '4px 8px' }}>
                Approved for Payment in the amount of{' '}
                <span className="gov-bold">{formatPeso(dv.netAmount)}</span>.
              </td>
            </tr>
            <tr>
              <td
                style={{
                  width: '50%',
                  textAlign: 'center',
                  padding: '16px 8px 4px',
                  borderRight: '1px solid #bbb',
                }}
              >
                <div className="gov-sig-line" style={{ width: '70%', margin: '0 auto 4px' }}></div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>
                  {dv.approver?.username?.toUpperCase() ?? ''}
                </div>
                <div style={{ fontSize: 8, color: '#667085' }}>
                  Printed Name &amp; Signature — Agency Head / Authorized Representative
                </div>
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

        {/* Box E - Receipt of Payment */}
        <table className="gov-table gov-table--bordered gov-table--compact">
          <tbody>
            <tr>
              <td
                colSpan={4}
                style={{ fontSize: 8, fontWeight: 700, background: '#f3f4f6', padding: '2px 6px' }}
              >
                E — Receipt of Payment
              </td>
            </tr>
            <tr>
              <td
                style={{
                  width: '15%',
                  fontSize: 9,
                  fontWeight: 700,
                  borderRight: '1px solid #bbb',
                }}
              >
                Check / ADA No.:
              </td>
              <td style={{ width: '25%', fontSize: 10, borderRight: '1px solid #bbb' }}>
                {dv.checkNumber ?? ''}
              </td>
              <td
                style={{
                  width: '10%',
                  fontSize: 9,
                  fontWeight: 700,
                  borderRight: '1px solid #bbb',
                }}
              >
                Date:
              </td>
              <td style={{ width: '20%', fontSize: 10 }}>
                {dv.checkDate ? new Date(dv.checkDate).toLocaleDateString('en-PH') : ''}
              </td>
            </tr>
            <tr>
              <td style={{ fontSize: 9, fontWeight: 700, borderRight: '1px solid #bbb' }}>
                Bank Name &amp; Account No.:
              </td>
              <td colSpan={3} style={{ fontSize: 10 }}>
                {dv.bankName ?? ''}
              </td>
            </tr>
            <tr>
              <td style={{ fontSize: 9, fontWeight: 700, borderRight: '1px solid #bbb' }}>
                JEV No.:
              </td>
              <td colSpan={3} className="gov-mono" style={{ fontSize: 10 }}>
                {je?.jevNumber ?? '—'}
              </td>
            </tr>
            <tr>
              <td colSpan={4} style={{ fontSize: 9, padding: '6px 8px' }}>
                Received Payment: _____________________________ Date: _____________ OR / Other
                Documents No.: _____________
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
