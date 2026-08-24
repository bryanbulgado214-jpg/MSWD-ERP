import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AccountingApiError, getBir2307, type Bir2307Data } from '../api';
import '../../procurement/pages/print-forms.css';

import { PayeeCombobox } from './PayeeCombobox';

// ── Editable model for BIR Form 2307 (page 1) ──
interface EwtRow {
  nature: string;
  atc: string;
  m1: string;
  m2: string;
  m3: string;
  total: string;
  tax: string;
}
const emptyRow = (): EwtRow => ({
  nature: '',
  atc: '',
  m1: '',
  m2: '',
  m3: '',
  total: '',
  tax: '',
});

interface Party {
  tin: string;
  name: string;
  address: string;
  zip: string;
  foreignAddress?: string;
}
interface SigBlock {
  name: string;
  accreditation: string;
  issueDate: string;
  expiryDate: string;
}
interface FormState {
  periodFrom: string;
  periodTo: string;
  payee: Party;
  payor: Party;
  ewt: EwtRow[];
  ewtTotalIncome: string;
  ewtTotalTax: string;
  bt: EwtRow[];
  btTotalIncome: string;
  btTotalTax: string;
  payorSig: SigBlock;
  payeeSig: SigBlock;
}

const money = (n: number) => (n ? n.toFixed(2) : '');
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Build the initial (prefilled) certificate from the DV's 2307 data. */
function buildState(d: Bir2307Data): FormState {
  const dvDate = new Date(d.dvDate);
  const y = dvDate.getFullYear();
  const q = Math.floor(dvDate.getMonth() / 3); // 0..3
  const monthInQuarter = dvDate.getMonth() % 3; // 0,1,2 → which month column
  const periodFrom = isoDate(new Date(y, q * 3, 1));
  const periodTo = isoDate(new Date(y, q * 3 + 3, 0));
  const col = (['m1', 'm2', 'm3'] as const)[monthInQuarter]!;

  const w = d.withholding;
  // With the withholding-tax assistant's breakdown, the income payment is the
  // tax base (net of VAT for VAT-registered payees) and the tax splits into the
  // creditable EWT (EWT section) and the government business-tax withholding
  // (Business Tax section). Otherwise fall back to the DV's gross figures.
  const ewtBase = w ? w.taxBase : d.incomePayment;
  const ewtTax = w ? w.ewt.amount : d.taxWithheld;
  const ewtRow = emptyRow();
  ewtRow.nature = w ? w.ewt.nature : d.particulars;
  ewtRow.atc = w ? w.ewt.atc : '';
  ewtRow.total = money(ewtBase);
  ewtRow.tax = money(ewtTax);
  ewtRow[col] = money(ewtBase);

  const btRows = Array.from({ length: 3 }, emptyRow);
  let btTotalIncome = '';
  let btTotalTax = '';
  if (w?.businessTax) {
    const bt = w.businessTax;
    const btRow = emptyRow();
    btRow.nature =
      bt.type === 'vat'
        ? 'Withholding VAT on government money payments (5%)'
        : 'Withholding percentage tax on government money payments (3%)';
    btRow.atc = bt.atc;
    btRow.total = money(w.taxBase);
    btRow.tax = money(bt.amount);
    btRow[col] = money(w.taxBase);
    btRows[0] = btRow;
    btTotalIncome = money(w.taxBase);
    btTotalTax = money(bt.amount);
  }

  return {
    periodFrom,
    periodTo,
    payee: { tin: d.payee.tin, name: d.payee.name, address: d.payee.address, zip: '' },
    payor: { tin: d.payor.tin, name: d.payor.name, address: d.payor.address, zip: '' },
    ewt: [ewtRow, ...Array.from({ length: 5 }, emptyRow)],
    ewtTotalIncome: money(ewtBase),
    ewtTotalTax: money(ewtTax),
    bt: btRows,
    btTotalIncome,
    btTotalTax,
    payorSig: { name: '', accreditation: '', issueDate: '', expiryDate: '' },
    payeeSig: { name: d.payee.name, accreditation: '', issueDate: '', expiryDate: '' },
  };
}

// Editable input that looks like a filled-in form field (prints its value).
const cellIn: React.CSSProperties = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  padding: '2px 3px',
  boxSizing: 'border-box',
};
const lineIn: React.CSSProperties = { ...cellIn, borderBottom: '1px solid #000' };
const numIn: React.CSSProperties = {
  ...cellIn,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

export default function Bir2307Page() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Bir2307Data | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getBir2307(id)
      .then((d) => {
        setData(d);
        setForm(buildState(d));
      })
      .catch((e) => setError(e instanceof AccountingApiError ? e.message : 'Failed to load.'));
  }, [id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const setParty = (which: 'payee' | 'payor', field: keyof Party, value: string) =>
    setForm((f) => (f ? { ...f, [which]: { ...f[which], [field]: value } } : f));
  const setSig = (which: 'payorSig' | 'payeeSig', field: keyof SigBlock, value: string) =>
    setForm((f) => (f ? { ...f, [which]: { ...f[which], [field]: value } } : f));
  const setRow = (bucket: 'ewt' | 'bt', idx: number, field: keyof EwtRow, value: string) =>
    setForm((f) => {
      if (!f) return f;
      const rows = f[bucket].map((r, i) => (i === idx ? { ...r, [field]: value } : r));
      return { ...f, [bucket]: rows };
    });

  const cols = useMemo(
    () => [
      { k: 'nature' as const, label: 'Income Payments Subject to Expanded Withholding Tax' },
      { k: 'atc' as const, label: 'ATC' },
      { k: 'm1' as const, label: '1st Month of the Quarter' },
      { k: 'm2' as const, label: '2nd Month of the Quarter' },
      { k: 'm3' as const, label: '3rd Month of the Quarter' },
      { k: 'total' as const, label: 'Total' },
      { k: 'tax' as const, label: 'Tax Withheld for the Quarter' },
    ],
    [],
  );

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!form || !data) return <div style={{ padding: 32, color: '#667085' }}>Loading…</div>;

  const th: React.CSSProperties = {
    border: '1px solid #000',
    fontSize: '7.5pt',
    fontWeight: 700,
    padding: '3px 2px',
    textAlign: 'center',
    verticalAlign: 'middle',
  };
  const td: React.CSSProperties = { border: '1px solid #000', padding: 0, verticalAlign: 'middle' };
  const partHead: React.CSSProperties = {
    background: '#000',
    color: '#fff',
    fontSize: '8.5pt',
    fontWeight: 700,
    padding: '2px 6px',
  };
  const num = (n: number) => ({ ...td, width: n });

  const renderRows = (bucket: 'ewt' | 'bt') =>
    form[bucket].map((r, i) => (
      <tr key={i}>
        {cols.map((c) => (
          <td key={c.k} style={c.k === 'nature' ? td : c.k === 'atc' ? num(60) : num(72)}>
            <input
              style={c.k === 'nature' || c.k === 'atc' ? cellIn : numIn}
              value={r[c.k]}
              onChange={(e) => setRow(bucket, i, c.k, e.target.value)}
            />
          </td>
        ))}
      </tr>
    ));

  return (
    <div className="gov-print-page">
      <div
        className="gov-print-sheet"
        style={{ fontFamily: "'Arial', 'Helvetica', sans-serif", fontSize: '9pt' }}
      >
        {/* ── Header ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td
                style={{ width: '16%', border: '1px solid #000', padding: 4, verticalAlign: 'top' }}
              >
                <div style={{ fontSize: '7pt', textAlign: 'center' }}>
                  For BIR Use Only
                  <div style={{ marginTop: 10 }}>BCS/</div>
                  <div>Item:</div>
                </div>
              </td>
              <td
                style={{
                  width: '58%',
                  textAlign: 'center',
                  verticalAlign: 'top',
                  padding: '2px 8px',
                }}
              >
                <div style={{ fontSize: '8pt' }}>Republic of the Philippines</div>
                <div style={{ fontSize: '8pt' }}>Department of Finance</div>
                <div style={{ fontSize: '8pt', marginBottom: 6 }}>Bureau of Internal Revenue</div>
                <div style={{ fontSize: '12pt', fontWeight: 700, lineHeight: 1.2 }}>
                  Certificate of Creditable Tax
                  <br />
                  Withheld at Source
                </div>
              </td>
              <td
                style={{ width: '26%', border: '1px solid #000', padding: 4, verticalAlign: 'top' }}
              >
                <div style={{ fontSize: '7.5pt' }}>BIR Form No.</div>
                <div style={{ fontSize: '22pt', fontWeight: 700, textAlign: 'center' }}>2307</div>
                <div style={{ fontSize: '7.5pt', textAlign: 'center' }}>January 2018 (ENCS)</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Period + instruction */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 2 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8.5pt' }}>
                <span style={{ fontWeight: 700 }}>1&nbsp;&nbsp;For the Period</span>
                <span style={{ marginLeft: 14 }}>From</span>
                <input
                  type="date"
                  style={{ ...lineIn, width: 130, display: 'inline-block' }}
                  value={form.periodFrom}
                  onChange={(e) => set('periodFrom', e.target.value)}
                />
                <span style={{ marginLeft: 10 }}>To</span>
                <input
                  type="date"
                  style={{ ...lineIn, width: 130, display: 'inline-block' }}
                  value={form.periodTo}
                  onChange={(e) => set('periodTo', e.target.value)}
                />
                <span style={{ marginLeft: 8, fontSize: '7pt', color: '#333' }}>(MM/DD/YYYY)</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: '7.5pt', fontStyle: 'italic', margin: '2px 0' }}>
          Fill in all applicable spaces. Mark all appropriate boxes with an “X”.
        </div>

        {/* ── Part I — Payee ── */}
        <div style={partHead}>Part I – Payee Information</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '2px 6px',
                  fontSize: '8pt',
                  width: '55%',
                }}
              >
                <b>2</b> Taxpayer Identification Number (TIN)
                <input
                  style={lineIn}
                  value={form.payee.tin}
                  onChange={(e) => setParty('payee', 'tin', e.target.value)}
                />
              </td>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}>
                <b>3</b> Payee’s Name
                <div style={{ fontSize: '6.5pt', color: '#333' }}>
                  (Last Name, First Name, Middle Name for Individual OR Registered Name for
                  Non-Individual)
                </div>
                <PayeeCombobox
                  name={form.payee.name}
                  onNameChange={(v) => setParty('payee', 'name', v)}
                  onPick={(pk) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            payee: {
                              ...f.payee,
                              name: pk.name,
                              tin: pk.tin ?? '',
                              address: pk.address ?? '',
                            },
                          }
                        : f,
                    )
                  }
                  inputStyle={lineIn}
                />
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}>
                <b>4</b> Registered Address
                <input
                  style={lineIn}
                  value={form.payee.address}
                  onChange={(e) => setParty('payee', 'address', e.target.value)}
                />
              </td>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}>
                <b>4A</b> ZIP Code
                <input
                  style={lineIn}
                  value={form.payee.zip}
                  onChange={(e) => setParty('payee', 'zip', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td
                colSpan={2}
                style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}
              >
                <b>5</b> Foreign Address, if applicable
                <input
                  style={lineIn}
                  value={form.payee.foreignAddress ?? ''}
                  onChange={(e) => setParty('payee', 'foreignAddress', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Part II — Payor ── */}
        <div style={partHead}>Part II – Payor Information</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '2px 6px',
                  fontSize: '8pt',
                  width: '55%',
                }}
              >
                <b>6</b> Taxpayer Identification Number (TIN)
                <input
                  style={lineIn}
                  value={form.payor.tin}
                  onChange={(e) => setParty('payor', 'tin', e.target.value)}
                />
              </td>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}>
                <b>7</b> Payor’s Name
                <div style={{ fontSize: '6.5pt', color: '#333' }}>
                  (Last Name, First Name, Middle Name for Individual OR Registered Name for
                  Non-Individual)
                </div>
                <input
                  style={lineIn}
                  value={form.payor.name}
                  onChange={(e) => setParty('payor', 'name', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}>
                <b>8</b> Registered Address
                <input
                  style={lineIn}
                  value={form.payor.address}
                  onChange={(e) => setParty('payor', 'address', e.target.value)}
                />
              </td>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '8pt' }}>
                <b>8A</b> ZIP Code
                <input
                  style={lineIn}
                  value={form.payor.zip}
                  onChange={(e) => setParty('payor', 'zip', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Part III — Details of Monthly Income Payments and Taxes Withheld ── */}
        <div style={partHead}>Part III – Details of Monthly Income Payments and Taxes Withheld</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '30%' }} rowSpan={2}>
                Income Payments Subject to Expanded Withholding Tax
              </th>
              <th style={{ ...th, width: 60 }} rowSpan={2}>
                ATC
              </th>
              <th style={th} colSpan={4}>
                AMOUNT OF INCOME PAYMENTS
              </th>
              <th style={{ ...th, width: 72 }} rowSpan={2}>
                Tax Withheld for the Quarter
              </th>
            </tr>
            <tr>
              <th style={{ ...th, width: 72 }}>1st Month of the Quarter</th>
              <th style={{ ...th, width: 72 }}>2nd Month of the Quarter</th>
              <th style={{ ...th, width: 72 }}>3rd Month of the Quarter</th>
              <th style={{ ...th, width: 72 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {renderRows('ewt')}
            <tr>
              <td
                style={{
                  ...td,
                  textAlign: 'right',
                  fontWeight: 700,
                  fontSize: '8pt',
                  padding: '2px 6px',
                }}
                colSpan={5}
              >
                Total
              </td>
              <td style={num(72)}>
                <input
                  style={{ ...numIn, fontWeight: 700 }}
                  value={form.ewtTotalIncome}
                  onChange={(e) => set('ewtTotalIncome', e.target.value)}
                />
              </td>
              <td style={num(72)}>
                <input
                  style={{ ...numIn, fontWeight: 700 }}
                  value={form.ewtTotalTax}
                  onChange={(e) => set('ewtTotalTax', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td
                colSpan={7}
                style={{
                  border: '1px solid #000',
                  padding: '2px 6px',
                  fontSize: '7.5pt',
                  fontWeight: 700,
                }}
              >
                Money Payments Subject to Withholding of Business Tax (Government &amp; Private)
              </td>
            </tr>
            {renderRows('bt')}
            <tr>
              <td
                style={{
                  ...td,
                  textAlign: 'right',
                  fontWeight: 700,
                  fontSize: '8pt',
                  padding: '2px 6px',
                }}
                colSpan={5}
              >
                Total
              </td>
              <td style={num(72)}>
                <input
                  style={{ ...numIn, fontWeight: 700 }}
                  value={form.btTotalIncome}
                  onChange={(e) => set('btTotalIncome', e.target.value)}
                />
              </td>
              <td style={num(72)}>
                <input
                  style={{ ...numIn, fontWeight: 700 }}
                  value={form.btTotalTax}
                  onChange={(e) => set('btTotalTax', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Certification ── */}
        <div
          style={{
            border: '1px solid #000',
            borderTop: 'none',
            padding: '5px 6px',
            fontSize: '7.5pt',
            textAlign: 'justify',
            lineHeight: 1.35,
          }}
        >
          We declare under the penalties of perjury that this certificate has been made in good
          faith, verified by us, and to the best of our knowledge and belief, is true and correct,
          pursuant to the provisions of the National Internal Revenue Code, as amended, and the
          regulations issued under authority thereof. Further, we give our consent to the processing
          of our information as contemplated under the Data Privacy Act of 2012 (R.A. No. 10173) for
          legitimate and lawful purposes.
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              {(['payorSig', 'payeeSig'] as const).map((who) => {
                const sig = form[who];
                const isPayee = who === 'payeeSig';
                return (
                  <td
                    key={who}
                    style={{
                      width: '50%',
                      border: '1px solid #000',
                      padding: '6px 8px',
                      verticalAlign: 'top',
                    }}
                  >
                    {isPayee && (
                      <div style={{ fontSize: '8pt', fontWeight: 700, marginBottom: 4 }}>
                        CONFORME:
                      </div>
                    )}
                    <input
                      style={{
                        ...lineIn,
                        textAlign: 'center',
                        fontWeight: 700,
                        marginTop: isPayee ? 0 : 18,
                      }}
                      value={sig.name}
                      onChange={(e) => setSig(who, 'name', e.target.value)}
                    />
                    <div style={{ fontSize: '6.8pt', textAlign: 'center', color: '#333' }}>
                      Signature over Printed Name of {isPayee ? 'Payee' : 'Payor'}/
                      {isPayee ? 'Payee' : 'Payor'}’s Authorized Representative/Tax Agent
                      <br />
                      (Indicate Title/Designation and TIN)
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <div style={{ flex: 2 }}>
                        <input
                          style={lineIn}
                          value={sig.accreditation}
                          onChange={(e) => setSig(who, 'accreditation', e.target.value)}
                        />
                        <div style={{ fontSize: '6.5pt', color: '#333' }}>
                          Tax Agent Accreditation No./ Attorney’s Roll No. (if applicable)
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          type="date"
                          style={lineIn}
                          value={sig.issueDate}
                          onChange={(e) => setSig(who, 'issueDate', e.target.value)}
                        />
                        <div style={{ fontSize: '6.5pt', color: '#333' }}>Date of Issue</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          type="date"
                          style={lineIn}
                          value={sig.expiryDate}
                          onChange={(e) => setSig(who, 'expiryDate', e.target.value)}
                        />
                        <div style={{ fontSize: '6.5pt', color: '#333' }}>Date of Expiry</div>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        <div
          style={{
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '7pt',
            color: '#555',
          }}
        >
          <span>
            BIR Form No. 2307 (ENCS) — Page 1 · Prefilled from {data.dvNumber}
            {data.jevNumber ? ` · ${data.jevNumber}` : ''}
          </span>
          <span>Printed: {new Date().toLocaleDateString('en-PH')}</span>
        </div>
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
