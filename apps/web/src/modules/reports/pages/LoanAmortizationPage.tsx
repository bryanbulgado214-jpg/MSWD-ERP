import { useMemo, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';

type Freq = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
type Method = 'annuity' | 'straight';

const FREQ: Record<Freq, { label: string; perYear: number; months: number }> = {
  monthly: { label: 'Monthly', perYear: 12, months: 1 },
  quarterly: { label: 'Quarterly', perYear: 4, months: 3 },
  semiannual: { label: 'Semi-annual', perYear: 2, months: 6 },
  annual: { label: 'Annual', perYear: 1, months: 12 },
};

interface Row {
  n: number;
  date: string;
  begin: number;
  payment: number;
  interest: number;
  principal: number;
  end: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
function addMonths(d: Date, m: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
}

/**
 * Loan amortization schedule generator for loans payable. Enter the loan terms
 * and it builds the full period-by-period schedule (beginning balance, payment,
 * interest, principal, ending balance), by either the equal-payment (annuity)
 * or equal-principal (straight-line) method. Self-contained — the figures are
 * computed in the browser, so it needs no stored loan data.
 */
export function LoanAmortizationPage() {
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [termValue, setTermValue] = useState('');
  const [termUnit, setTermUnit] = useState<'years' | 'months'>('years');
  const [freq, setFreq] = useState<Freq>('monthly');
  const [method, setMethod] = useState<Method>('annuity');
  const [firstDate, setFirstDate] = useState('');

  const result = useMemo(() => {
    const P = parseFloat(principal) || 0;
    const annual = (parseFloat(ratePct) || 0) / 100;
    const perYear = FREQ[freq].perYear;
    const termYears =
      termUnit === 'years' ? parseFloat(termValue) || 0 : (parseFloat(termValue) || 0) / 12;
    const n = Math.round(termYears * perYear);
    if (P <= 0 || n < 1) return null;

    const i = annual / perYear; // periodic rate
    const start = firstDate ? new Date(firstDate) : null;
    const fixedPayment =
      method === 'annuity' ? (i === 0 ? P / n : (P * i) / (1 - (1 + i) ** -n)) : 0;
    const fixedPrincipal = P / n;

    const rows: Row[] = [];
    let balance = P;
    for (let k = 1; k <= n; k++) {
      const begin = round2(balance);
      const interest = round2(begin * i);
      let principalPart: number;
      let payment: number;
      if (method === 'annuity') {
        payment = round2(fixedPayment);
        principalPart = round2(payment - interest);
      } else {
        principalPart = round2(fixedPrincipal);
        payment = round2(principalPart + interest);
      }
      // Final period absorbs rounding so the balance closes exactly at zero.
      if (k === n) {
        principalPart = begin;
        payment = round2(begin + interest);
      }
      const end = round2(begin - principalPart);
      balance = end;
      rows.push({
        n: k,
        date: start
          ? addMonths(start, FREQ[freq].months * (k - 1)).toLocaleDateString('en-PH')
          : '',
        begin,
        payment,
        interest,
        principal: principalPart,
        end,
      });
    }
    const totals = rows.reduce(
      (t, r) => ({
        payment: t.payment + r.payment,
        interest: t.interest + r.interest,
        principal: t.principal + r.principal,
      }),
      { payment: 0, interest: 0, principal: 0 },
    );
    return {
      rows,
      n,
      periodic: method === 'annuity' ? round2(fixedPayment) : null,
      totals: {
        payment: round2(totals.payment),
        interest: round2(totals.interest),
        principal: round2(totals.principal),
      },
    };
  }, [principal, ratePct, termValue, termUnit, freq, method, firstDate]);

  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#344054' };
  const input: React.CSSProperties = {
    padding: '7px 9px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    fontSize: 13,
    boxSizing: 'border-box',
    minWidth: 0,
  };

  return (
    <div>
      <h2>Loan Amortization Schedule</h2>
      <p className="reports-subtitle">
        Build a period-by-period repayment schedule for a loan payable. Enter the loan terms — the
        schedule and totals compute instantly, and can be exported to Excel or PDF above.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          maxWidth: 920,
          marginBottom: 18,
        }}
      >
        <div style={{ ...field, gridColumn: '1 / -1', maxWidth: 380 }}>
          <span style={label}>Loan / Creditor name</span>
          <input
            style={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. LWUA Term Loan"
          />
        </div>
        <div style={field}>
          <span style={label}>Principal amount</span>
          <input
            style={input}
            type="number"
            min="0"
            step="0.01"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div style={field}>
          <span style={label}>Annual interest rate (%)</span>
          <input
            style={input}
            type="number"
            min="0"
            step="0.001"
            value={ratePct}
            onChange={(e) => setRatePct(e.target.value)}
            placeholder="e.g. 8.5"
          />
        </div>
        <div style={field}>
          <span style={label}>Term</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              style={{ ...input, flex: 1 }}
              type="number"
              min="0"
              step="1"
              value={termValue}
              onChange={(e) => setTermValue(e.target.value)}
              placeholder="e.g. 5"
            />
            <select
              style={{ ...input, width: 96 }}
              value={termUnit}
              onChange={(e) => setTermUnit(e.target.value as 'years' | 'months')}
            >
              <option value="years">years</option>
              <option value="months">months</option>
            </select>
          </div>
        </div>
        <div style={field}>
          <span style={label}>Payment frequency</span>
          <select style={input} value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
            {(Object.keys(FREQ) as Freq[]).map((f) => (
              <option key={f} value={f}>
                {FREQ[f].label}
              </option>
            ))}
          </select>
        </div>
        <div style={field}>
          <span style={label}>Amortization method</span>
          <select
            style={input}
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
          >
            <option value="annuity">Equal payment (annuity)</option>
            <option value="straight">Equal principal (straight-line)</option>
          </select>
        </div>
        <div style={field}>
          <span style={label}>First payment date</span>
          <input
            style={input}
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </div>
      </div>

      {!result ? (
        <div className="reports-loading">
          Enter a principal amount and term to generate the schedule.
        </div>
      ) : (
        <>
          <p className="reports-subtitle" style={{ marginBottom: 12 }}>
            {name ? <strong>{name} — </strong> : null}
            {formatPeso(parseFloat(principal) || 0)} over {result.n}{' '}
            {FREQ[freq].label.toLowerCase()} payment{result.n === 1 ? '' : 's'} at{' '}
            {parseFloat(ratePct) || 0}% p.a.
            {result.periodic !== null && (
              <>
                {' '}
                · Level payment <strong>{formatPeso(result.periodic)}</strong>
              </>
            )}{' '}
            · Total interest <strong>{formatPeso(result.totals.interest)}</strong>
          </p>

          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'right' }}>#</th>
                  <th>Payment Date</th>
                  <th style={{ textAlign: 'right' }}>Beginning Balance</th>
                  <th style={{ textAlign: 'right' }}>Payment</th>
                  <th style={{ textAlign: 'right' }}>Interest</th>
                  <th style={{ textAlign: 'right' }}>Principal</th>
                  <th style={{ textAlign: 'right' }}>Ending Balance</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.n}>
                    <td style={{ textAlign: 'right' }}>{r.n}</td>
                    <td>{r.date || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatPeso(r.begin)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatPeso(r.payment)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatPeso(r.interest)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatPeso(r.principal)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatPeso(r.end)}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
                  <td colSpan={3} style={{ textAlign: 'right' }}>
                    Total
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(result.totals.payment)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(result.totals.interest)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(result.totals.principal)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
