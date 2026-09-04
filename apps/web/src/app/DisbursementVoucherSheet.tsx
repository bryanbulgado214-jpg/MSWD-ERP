import { useAuth } from './auth';
import { signatoryFor } from './signatories';
import '../modules/procurement/pages/print-forms.css';
import './dv-print.css';

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

/** Plain grouped amount ("9,216.00") — the form prints "Php" separately, so no ₱. */
function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const s = typeof v === 'number' ? String(v) : v;
  const neg = s.startsWith('-');
  const u = neg ? s.slice(1) : s;
  const parts = u.split('.');
  const whole = (parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (parts[1] ?? '00').padEnd(2, '0').slice(0, 2);
  return `${neg ? '-' : ''}${whole}.${dec}`;
}

const BORDER = '1px solid #000';
const FALLBACK_LOGO = '/aquabooks-mark.png';

/**
 * The Metro Siquijor Water District Disbursement Voucher — an exact reproduction
 * of the district's pre-printed form, filling a single Letter page. Renders for
 * both a procurement DV and a non-procurement (accounting) DV; the payee,
 * particulars, accounting entry and signatories adapt to whichever data exists.
 */
export function DisbursementVoucherSheet({ dv }: { dv: DvSheetData }) {
  const { organization } = useAuth();
  // The header carries the district's full legal name (not the short name/initials).
  const entity = (
    organization?.legalName ||
    organization?.name ||
    'Metro Siquijor Water District'
  ).toUpperCase();
  const logo = organization?.logoUrl || FALLBACK_LOGO;

  // Box A = requesting/supervising officer; Box B (this form) = funds-available
  // certification (the "boxC" slot); Box C (this form) = approver (the "boxD" slot).
  const sigA = signatoryFor(organization?.signatories, 'dv', 'boxA');
  const sigB = signatoryFor(organization?.signatories, 'dv', 'boxC');
  const sigC = signatoryFor(organization?.signatories, 'dv', 'boxD');
  const approverName = sigC?.name || dv.approver?.username || '';
  const approverTitle = sigC?.title || '';

  const dvDate = new Date(dv.dvDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const payeeName = dv.supplier?.name ?? dv.payeeName ?? '';
  const payeeTin = dv.supplier?.tin ?? dv.payeeTin ?? '';
  const payeeAddress = dv.supplier?.address ?? dv.payeeAddress ?? '';

  const mode = dv.paymentMode;
  const isAda = mode === 'ada';

  // The accounting entry is driven by the posted JEV (never re-derived), so it
  // matches the GL.
  const jeLines = dv.journalEntry?.lines ?? [];
  const jeTotalDebit = jeLines.reduce((s, l) => s + parseFloat(l.debitAmount || '0'), 0);
  const jeTotalCredit = jeLines.reduce((s, l) => s + parseFloat(l.creditAmount || '0'), 0);

  const chk = (on: boolean) => <span className="gov-checkbox">{on ? '☑' : '☐'}</span>;
  // If the configured logo URL fails to load, fall back to the bundled mark so
  // the header never shows a broken image.
  const onLogoError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.src.endsWith(FALLBACK_LOGO)) img.src = FALLBACK_LOGO;
  };

  const label9: React.CSSProperties = { fontSize: '9pt', fontWeight: 700 };
  const sigCell = (name: string, title: string) => (
    <div style={{ padding: '2px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', padding: '5px 2px 1px', verticalAlign: 'bottom' }}>
              Signature
            </td>
            <td style={{ borderBottom: BORDER, padding: '5px 2px 1px' }}>&nbsp;</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 2px 1px', verticalAlign: 'bottom' }}>Printed Name</td>
            <td
              style={{
                borderBottom: BORDER,
                padding: '8px 2px 1px',
                textAlign: 'center',
                fontWeight: 700,
              }}
            >
              {name ? name.toUpperCase() : ' '}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '8px 2px 1px', verticalAlign: 'bottom' }}>Position</td>
            <td
              style={{
                borderBottom: BORDER,
                padding: '8px 2px 1px',
                textAlign: 'center',
                fontWeight: 700,
              }}
            >
              {title || ' '}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '8px 2px 1px', verticalAlign: 'bottom' }}>Date</td>
            <td style={{ borderBottom: BORDER, padding: '8px 2px 1px' }}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="gov-print-page">
      <div className="dv-print-sheet">
        {/* ── Header + Mode of Payment ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: BORDER }}>
          <tbody>
            <tr>
              <td style={{ border: BORDER, padding: 0, width: '72%' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
                  <img
                    src={logo}
                    alt=""
                    onError={onLogoError}
                    style={{ height: 60, width: 60, objectFit: 'contain', marginRight: 10 }}
                  />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14pt', fontWeight: 700, lineHeight: 1.15 }}>
                      {entity}
                    </div>
                    <div
                      style={{ fontSize: '14pt', fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}
                    >
                      DISBURSEMENT VOUCHER
                    </div>
                  </div>
                </div>
              </td>
              <td style={{ border: BORDER, padding: 0, verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', height: '100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ borderBottom: BORDER, padding: '4px 6px', ...label9 }}>
                        DV No:
                      </td>
                      <td style={{ borderBottom: BORDER, padding: '4px 6px', fontWeight: 700 }}>
                        {dv.dvNumber ?? ''}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 6px', width: '42%', ...label9 }}>DV Date:</td>
                      <td style={{ borderLeft: BORDER, padding: '6px 6px' }}>{dvDate}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ border: BORDER, padding: '3px 8px 5px' }}>
                <div
                  style={{
                    textAlign: 'center',
                    fontStyle: 'italic',
                    fontWeight: 700,
                    fontSize: '10pt',
                  }}
                >
                  MODE OF PAYMENT
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-around',
                    fontSize: '10pt',
                    marginTop: 2,
                  }}
                >
                  <span>{chk(false)} MDS Check</span>
                  <span>{chk(mode === 'check')} Commercial Check</span>
                  <span>{chk(isAda)} ADA</span>
                  <span>{chk(mode === 'others')} Others</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Payee / TIN / Address ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: BORDER, borderTop: 0 }}>
          <tbody>
            <tr>
              <td style={{ border: BORDER, padding: '6px 8px', width: '13%', ...label9 }}>
                Payee:
              </td>
              <td
                style={{
                  border: BORDER,
                  padding: '6px 8px',
                  width: '61%',
                  fontStyle: 'italic',
                  fontWeight: 700,
                  fontSize: '12pt',
                }}
              >
                {payeeName}
              </td>
              <td style={{ border: BORDER, padding: '6px 8px', verticalAlign: 'top', ...label9 }}>
                Payee&apos;s TIN: <span style={{ fontWeight: 400 }}>{payeeTin}</span>
              </td>
            </tr>
            <tr>
              <td style={{ border: BORDER, padding: '6px 8px', ...label9 }}>Address:</td>
              <td colSpan={2} style={{ border: BORDER, padding: '6px 8px', fontWeight: 700 }}>
                {payeeAddress}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Particulars / Amount + Accounting entry (flexes to fill the page) ── */}
        <div className="dv-acct">
          <table
            style={{ width: '100%', borderCollapse: 'collapse', border: BORDER, borderTop: 0 }}
          >
            <colgroup>
              <col style={{ width: '56%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={2} style={{ border: BORDER, textAlign: 'center', padding: '3px 6px' }}>
                  Particulars
                </td>
                <td colSpan={2} style={{ border: BORDER, textAlign: 'center', padding: '3px 6px' }}>
                  Amount
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ border: BORDER, padding: '5px 8px' }}>
                  {dv.particulars}
                </td>
                <td style={{ border: BORDER, textAlign: 'center', padding: '5px 6px' }}>Php</td>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'right',
                    padding: '5px 8px',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {money(dv.grossAmount)}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '2px 6px',
                  }}
                >
                  ACCOUNT NAME
                </td>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '2px 6px',
                  }}
                >
                  ACCOUNT CODE
                </td>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '2px 6px',
                  }}
                >
                  DEBIT
                </td>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '2px 6px',
                  }}
                >
                  CREDIT
                </td>
              </tr>
              {jeLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ border: BORDER, padding: '3px 8px' }}>{l.chartOfAccount.name}</td>
                  <td style={{ border: BORDER, textAlign: 'center', padding: '3px 6px' }}>
                    {l.chartOfAccount.accountCode}
                  </td>
                  <td
                    style={{
                      border: BORDER,
                      textAlign: 'right',
                      padding: '3px 8px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {parseFloat(l.debitAmount || '0') > 0 ? money(l.debitAmount) : ''}
                  </td>
                  <td
                    style={{
                      border: BORDER,
                      textAlign: 'right',
                      padding: '3px 8px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {parseFloat(l.creditAmount || '0') > 0 ? money(l.creditAmount) : ''}
                  </td>
                </tr>
              ))}
              {/* Ruled filler stretches to the page foot. */}
              <tr style={{ height: '100%' }}>
                <td className="dv-fill" style={{ border: BORDER }}>
                  &nbsp;
                </td>
                <td className="dv-fill" style={{ border: BORDER }}></td>
                <td className="dv-fill" style={{ border: BORDER }}></td>
                <td className="dv-fill" style={{ border: BORDER }}></td>
              </tr>
              <tr>
                <td
                  colSpan={2}
                  style={{
                    border: BORDER,
                    textAlign: 'right',
                    fontWeight: 700,
                    padding: '2px 8px',
                  }}
                >
                  TOTAL
                </td>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'right',
                    fontWeight: 700,
                    padding: '2px 8px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {jeLines.length ? money(jeTotalDebit.toFixed(2)) : ''}
                </td>
                <td
                  style={{
                    border: BORDER,
                    textAlign: 'right',
                    fontWeight: 700,
                    padding: '2px 8px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {jeLines.length ? money(jeTotalCredit.toFixed(2)) : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Certifications A | B | C  and  Received | Check details | JEV ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: BORDER, borderTop: 0 }}>
          <colgroup>
            <col style={{ width: '38%' }} />
            <col style={{ width: '38%' }} />
            <col style={{ width: '24%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ border: BORDER, padding: '5px 8px', verticalAlign: 'top' }}>
                <div style={{ fontSize: '9.5pt', minHeight: 50 }}>
                  A) Certified: Expenses/Advances necessary, lawful and incurred under my direct
                  supervision
                </div>
                {sigCell(sigA?.name ?? '', sigA?.title ?? '')}
              </td>
              <td style={{ border: BORDER, padding: '5px 8px', verticalAlign: 'top' }}>
                <div style={{ fontSize: '9.5pt', minHeight: 50 }}>
                  B) Certified:
                  <div style={{ paddingLeft: 12 }}>
                    Supporting documents complete and proper; and
                  </div>
                  <div style={{ paddingLeft: 24, marginTop: 2 }}>{chk(!isAda)} Cash available</div>
                  <div style={{ paddingLeft: 24, marginTop: 2 }}>{chk(isAda)} Subject ADA</div>
                </div>
                {sigCell(sigB?.name ?? '', sigB?.title ?? '')}
              </td>
              <td style={{ border: BORDER, padding: '5px 8px', verticalAlign: 'top' }}>
                <div style={{ fontSize: '9.5pt' }}>C) Approved For Payment</div>
                <div style={{ textAlign: 'center', marginTop: 26 }}>
                  <div style={{ fontWeight: 700, fontSize: '11pt' }}>
                    {approverName ? approverName.toUpperCase() : ' '}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '10pt', marginTop: 8 }}>
                    {approverTitle || ' '}
                  </div>
                </div>
                <div style={{ fontSize: '10pt', marginTop: 18 }}>P.O. No.</div>
              </td>
            </tr>
            <tr>
              <td style={{ border: BORDER, padding: '6px 8px', verticalAlign: 'top' }}>
                <div style={{ fontSize: '9.5pt' }}>
                  D) Received:&nbsp;&nbsp;Php{' '}
                  <span
                    style={{
                      borderBottom: BORDER,
                      fontWeight: 700,
                      padding: '0 6px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {money(dv.netAmount)}
                  </span>
                </div>
                <div style={{ marginTop: 30, textAlign: 'center' }}>
                  <div style={{ borderBottom: BORDER, height: 1, margin: '0 8px' }}></div>
                  <div style={{ fontSize: '9pt', fontWeight: 700, marginTop: 2 }}>
                    Signature Over Printed Name
                  </div>
                </div>
              </td>
              <td style={{ border: BORDER, padding: 0, verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '5px 6px', width: '38%', ...label9 }}>Check/ADA No:</td>
                      <td style={{ borderBottom: BORDER, padding: '5px 6px' }}>
                        {dv.checkNumber ?? ''}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 6px', ...label9 }}>Bank Name:</td>
                      <td style={{ borderBottom: BORDER, padding: '5px 6px' }}>
                        {dv.bankName ?? ''}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 6px', ...label9 }}>O.R. No.</td>
                      <td style={{ borderBottom: BORDER, padding: '5px 6px' }}>&nbsp;</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 6px', ...label9 }}>Date</td>
                      <td style={{ borderBottom: BORDER, padding: '5px 6px' }}>
                        {dv.checkDate ? new Date(dv.checkDate).toLocaleDateString('en-PH') : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td style={{ border: BORDER, padding: '4px 8px', verticalAlign: 'top', ...label9 }}>
                JEV No.: <span style={{ fontWeight: 400 }}>{dv.journalEntry?.jevNumber ?? ''}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
