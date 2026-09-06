import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AccountingApiError, getBir2307, type Bir2307Data } from '../api';
import '../../procurement/pages/print-forms.css';
import './bir2307.css';

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
  designation: string;
  tin: string;
}
interface FormState {
  periodFrom: string; // ISO yyyy-mm-dd
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

const money = (n: number) => (n ? n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '');
// Local calendar date (NOT toISOString, which shifts to UTC and can roll the day
// back — e.g. the quarter's 1st printing as the previous month's last day).
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');
/** ISO yyyy-mm-dd → "MMDDYYYY" digits for the form's date comb. */
const mmddyyyy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[2]}${m[3]}${m[1]}` : '';
};

const EWT_ROWS = 10;
const BT_ROWS = 10;

/** Build the initial (prefilled) certificate from the DV's 2307 data. */
function buildState(d: Bir2307Data): FormState {
  const dvDate = new Date(d.dvDate);
  const y = dvDate.getFullYear();
  const q = Math.floor(dvDate.getMonth() / 3);
  const monthInQuarter = dvDate.getMonth() % 3;
  const periodFrom = isoDate(new Date(y, q * 3, 1));
  const periodTo = isoDate(new Date(y, q * 3 + 3, 0));
  const col = (['m1', 'm2', 'm3'] as const)[monthInQuarter]!;

  const w = d.withholding;
  const ewtBase = w ? w.taxBase : d.incomePayment;
  const ewtTax = w ? w.ewt.amount : d.taxWithheld;
  const ewtRow = emptyRow();
  ewtRow.nature = w ? w.ewt.nature : d.particulars;
  ewtRow.atc = w ? w.ewt.atc : '';
  ewtRow.total = money(ewtBase);
  ewtRow.tax = money(ewtTax);
  ewtRow[col] = money(ewtBase);

  const btRows = Array.from({ length: BT_ROWS }, emptyRow);
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

  const ewt = Array.from({ length: EWT_ROWS }, emptyRow);
  ewt[0] = ewtRow;

  return {
    periodFrom,
    periodTo,
    payee: { tin: d.payee.tin, name: d.payee.name, address: d.payee.address, zip: '' },
    payor: { tin: d.payor.tin, name: d.payor.name, address: d.payor.address, zip: d.payor.zip },
    ewt,
    ewtTotalIncome: money(ewtBase),
    ewtTotalTax: money(ewtTax),
    bt: btRows,
    btTotalIncome,
    btTotalTax,
    payorSig: {
      name: d.payorRep.name,
      designation: d.payorRep.designation,
      tin: d.payorRep.tin,
    },
    payeeSig: { name: d.payee.name, designation: '', tin: '' },
  };
}

// ── Coordinate map (points; the form's own page is 612 × 936 pt = 8.5 × 13 in) ──
const PW = 612;
const PH = 936;
const pctL = (x: number) => `${(x / PW) * 100}%`;
const pctT = (y: number) => `${(y / PH) * 100}%`;
const COL = {
  nature: [18.6, 176.9],
  atc: [176.9, 220.1],
  m1: [220.1, 292.1],
  m2: [292.1, 366.4],
  m3: [366.4, 438.5],
  tot: [438.5, 510.5],
  tax: [510.5, 596.9],
} as const;
const EWT_Y0 = 365.3;
const BT_Y0 = 534.9;
const RH = 13.69;

/** Absolutely-positioned, transparent, editable field over the form. */
function Field({
  x,
  x1,
  yc,
  value,
  onChange,
  size = 9,
  align = 'left',
  bold = false,
  pad = 0,
}: {
  x: number;
  x1: number;
  yc: number;
  value: string;
  onChange: (v: string) => void;
  size?: number;
  align?: 'left' | 'right' | 'center';
  bold?: boolean;
  pad?: number;
}) {
  return (
    <input
      className="b7-in"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        left: pctL(x),
        top: pctT(yc),
        width: `${((x1 - x) / PW) * 100}%`,
        transform: 'translateY(-50%)',
        fontSize: `${size}pt`,
        fontWeight: bold ? 700 : 400,
        textAlign: align,
        padding: `0 ${pad}px`,
      }}
    />
  );
}

/** Digits dropped into the form's comb cells (display-only, from data). */
function Digits({
  x0,
  x1,
  cells,
  value,
  yc,
  size = 9,
}: {
  x0: number;
  x1: number;
  cells: number;
  value: string;
  yc: number;
  size?: number;
}) {
  const digits = (value || '').replace(/[^0-9A-Za-z]/g, '');
  const w = (x1 - x0) / cells;
  return (
    <>
      {digits
        .slice(0, cells)
        .split('')
        .map((ch, i) => (
          <span
            key={i}
            className="b7-dig"
            style={{ left: pctL(x0 + (i + 0.5) * w), top: pctT(yc), fontSize: `${size}pt` }}
          >
            {ch}
          </span>
        ))}
    </>
  );
}

/** Centered display line (for the signature blocks). */
function Ctr({
  x,
  yc,
  value,
  size = 9,
  bold = false,
}: {
  x: number;
  yc: number;
  value: string;
  size?: number;
  bold?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      className="b7-ctr"
      style={{ left: pctL(x), top: pctT(yc), fontSize: `${size}pt`, fontWeight: bold ? 700 : 400 }}
    >
      {value}
    </div>
  );
}

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

  const setParty = (which: 'payee' | 'payor', field: keyof Party, value: string) =>
    setForm((f) => (f ? { ...f, [which]: { ...f[which], [field]: value } } : f));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const setRow = (bucket: 'ewt' | 'bt', idx: number, field: keyof EwtRow, value: string) =>
    setForm((f) => {
      if (!f) return f;
      const rows = f[bucket].map((r, i) => (i === idx ? { ...r, [field]: value } : r));
      return { ...f, [bucket]: rows };
    });

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!form || !data) return <div style={{ padding: 32, color: '#667085' }}>Loading…</div>;

  // Digits only, so a formatted "123-456-789-00000" lands in the right comb cells.
  const payeeTin = onlyDigits(form.payee.tin);
  const payorTin = onlyDigits(form.payor.tin);

  const rowFields = (bucket: 'ewt' | 'bt', rows: EwtRow[], y0: number) =>
    rows.map((r, i) => {
      const yc = y0 + (i + 0.5) * RH;
      return (
        <Fragment key={`${bucket}-${i}`}>
          <Field
            x={COL.nature[0] + 2}
            x1={COL.nature[1] - 2}
            yc={yc}
            size={7.5}
            value={r.nature}
            onChange={(v) => setRow(bucket, i, 'nature', v)}
          />
          <Field
            x={COL.atc[0]}
            x1={COL.atc[1]}
            yc={yc}
            size={8}
            align="center"
            value={r.atc}
            onChange={(v) => setRow(bucket, i, 'atc', v)}
          />
          {(['m1', 'm2', 'm3', 'total', 'tax'] as const).map((k) => {
            const c = k === 'total' ? COL.tot : k === 'tax' ? COL.tax : COL[k];
            return (
              <Field
                key={k}
                x={c[0]}
                x1={c[1]}
                yc={yc}
                size={8}
                align="right"
                pad={3}
                value={r[k]}
                onChange={(v) => setRow(bucket, i, k, v)}
              />
            );
          })}
        </Fragment>
      );
    });

  return (
    <div className="gov-print-page">
      <div className="b7-sheet">
        <img className="b7-bg" src="/bir2307-form.svg" alt="" />

        {/* Period (comb, display) */}
        <Digits x0={151.5} x1={256.8} cells={8} yc={114.4} value={mmddyyyy(form.periodFrom)} />
        <Digits x0={399.1} x1={504.4} cells={8} yc={114.0} value={mmddyyyy(form.periodTo)} />

        {/* Part I — Payee */}
        <Digits x0={207.2} x1={246.8} cells={3} yc={145.1} value={payeeTin.slice(0, 3)} />
        <Digits x0={258.9} x1={298.4} cells={3} yc={145.1} value={payeeTin.slice(3, 6)} />
        <Digits x0={310.2} x1={349.8} cells={3} yc={145.1} value={payeeTin.slice(6, 9)} />
        <Digits x0={361.5} x1={435.4} cells={5} yc={145.1} value={payeeTin.slice(9)} />
        <Field
          x={37}
          x1={588}
          yc={174}
          size={9.5}
          value={form.payee.name}
          onChange={(v) => setParty('payee', 'name', v)}
        />
        <Field
          x={37}
          x1={533}
          yc={202}
          value={form.payee.address}
          onChange={(v) => setParty('payee', 'address', v)}
        />
        <Digits x0={541.8} x1={591.8} cells={4} yc={200.6} value={form.payee.zip} />
        <Field
          x={37}
          x1={588}
          yc={229}
          value={form.payee.foreignAddress ?? ''}
          onChange={(v) => setParty('payee', 'foreignAddress', v)}
        />

        {/* Part II — Payor (from District Profile) */}
        <Digits x0={208.0} x1={247.6} cells={3} yc={260.5} value={payorTin.slice(0, 3)} />
        <Digits x0={259.5} x1={299.1} cells={3} yc={260.5} value={payorTin.slice(3, 6)} />
        <Digits x0={310.9} x1={350.5} cells={3} yc={260.5} value={payorTin.slice(6, 9)} />
        <Digits x0={362.3} x1={436.3} cells={5} yc={260.5} value={payorTin.slice(9)} />
        <Field
          x={37}
          x1={588}
          yc={289}
          size={9.5}
          value={form.payor.name}
          onChange={(v) => setParty('payor', 'name', v)}
        />
        <Field
          x={37}
          x1={533}
          yc={317}
          value={form.payor.address}
          onChange={(v) => setParty('payor', 'address', v)}
        />
        <Digits x0={541.8} x1={591.8} cells={4} yc={315.9} value={form.payor.zip} />

        {/* Part III — table */}
        {rowFields('ewt', form.ewt, EWT_Y0)}
        <Field
          x={COL.tot[0]}
          x1={COL.tot[1]}
          yc={508.7}
          size={8}
          align="right"
          pad={3}
          bold
          value={form.ewtTotalIncome}
          onChange={(v) => set('ewtTotalIncome', v)}
        />
        <Field
          x={COL.tax[0]}
          x1={COL.tax[1]}
          yc={508.7}
          size={8}
          align="right"
          pad={3}
          bold
          value={form.ewtTotalTax}
          onChange={(v) => set('ewtTotalTax', v)}
        />
        {rowFields('bt', form.bt, BT_Y0)}
        <Field
          x={COL.tot[0]}
          x1={COL.tot[1]}
          yc={678.5}
          size={8}
          align="right"
          pad={3}
          bold
          value={form.btTotalIncome}
          onChange={(v) => set('btTotalIncome', v)}
        />
        <Field
          x={COL.tax[0]}
          x1={COL.tax[1]}
          yc={678.5}
          size={8}
          align="right"
          pad={3}
          bold
          value={form.btTotalTax}
          onChange={(v) => set('btTotalTax', v)}
        />

        {/* Payor signatory (name / designation / TIN), centered above the line */}
        <Ctr x={307.7} yc={727} size={8.5} bold value={form.payorSig.name} />
        <Ctr x={307.7} yc={736} size={7.5} value={form.payorSig.designation} />
        <Ctr
          x={307.7}
          yc={744.5}
          size={7.5}
          value={form.payorSig.tin ? `TIN: ${form.payorSig.tin}` : ''}
        />
        {/* Payee (CONFORME) */}
        <Ctr x={307.7} yc={815} size={9} bold value={form.payeeSig.name} />
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
