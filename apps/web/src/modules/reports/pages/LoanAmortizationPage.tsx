import { useEffect, useMemo, useState } from 'react';

import {
  AccountingApiError,
  createLoan,
  createLoanLineDv,
  deleteLoan,
  getBankAccounts,
  getChartOfAccounts,
  getLoan,
  getLoans,
  markLoanLinePaid,
  postLoan,
  type CreateLoanInput,
  type LoanDetail,
  type LoanSummary,
} from '../../accounting/api';
import { bankAccountLabel } from '../../accounting/bank-account-label';
import { AccountCombobox } from '../../accounting/pages/AccountCombobox';
import '../../accounting/pages/accounting.css';
import type { BankAccount, ChartOfAccount } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

const FREQ: Record<string, { label: string; perYear: number }> = {
  monthly: { label: 'Monthly', perYear: 12 },
  quarterly: { label: 'Quarterly', perYear: 4 },
  semiannual: { label: 'Semi-annual', perYear: 2 },
  annual: { label: 'Annual', perYear: 1 },
};

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: 'Paid', color: '#067647', bg: '#ecfdf3' },
  for_payment: { label: 'For payment', color: '#b54708', bg: '#fffaeb' },
  overdue: { label: 'Overdue', color: '#b42318', bg: '#fef3f2' },
  upcoming: { label: 'Upcoming', color: '#475467', bg: '#f2f4f7' },
};

// ── CSV parsing for an existing loan's uploaded schedule ──
interface SchedRow {
  seq: number;
  dueDate: string;
  beginningBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
}
function toIso(s: string): string | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, a, b, rawY] = m;
    if (a !== undefined && b !== undefined && rawY !== undefined) {
      const y = rawY.length === 2 ? `20${rawY}` : rawY;
      return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
    }
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
const numOf = (s: string) => {
  const n = parseFloat((s ?? '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
function parseSchedule(text: string, principalTotal: number): { rows: SchedRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Paste a header row and at least one line.' };
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const find = (...pats: RegExp[]) => header.findIndex((h) => pats.some((p) => p.test(h)));
  const iDate = find(/date|due/);
  const iPrincipal = find(/principal/);
  const iInterest = find(/interest/);
  const iPayment = find(/payment|amortization|total/);
  const iEnd = find(/ending|balance|outstanding/);
  if (iDate < 0) return { rows: [], error: 'Could not find a Due Date column.' };
  if (iPrincipal < 0 && iPayment < 0)
    return { rows: [], error: 'Could not find a Principal or Payment column.' };

  let running = principalTotal;
  const rows: SchedRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const dueDate = toIso(c[iDate] ?? '');
    if (!dueDate) continue;
    const principal = iPrincipal >= 0 ? numOf(c[iPrincipal] ?? '') : 0;
    const interest = iInterest >= 0 ? numOf(c[iInterest] ?? '') : 0;
    const payment =
      iPayment >= 0 ? numOf(c[iPayment] ?? '') : Math.round((principal + interest) * 100) / 100;
    const begin = running;
    const end = iEnd >= 0 ? numOf(c[iEnd] ?? '') : Math.round((begin - principal) * 100) / 100;
    running = end;
    rows.push({
      seq: rows.length + 1,
      dueDate,
      beginningBalance: begin,
      payment,
      interest,
      principal: principal || Math.round((payment - interest) * 100) / 100,
      endingBalance: end,
    });
  }
  if (!rows.length) return { rows: [], error: 'No valid schedule lines found.' };
  return { rows };
}

export function LoanAmortizationPage() {
  const [loans, setLoans] = useState<LoanSummary[] | null>(null);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [mode, setMode] = useState<'list' | 'new' | 'detail'>('list');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);

  const loadLoans = () =>
    getLoans()
      .then(setLoans)
      .catch((e) =>
        setError(e instanceof AccountingApiError ? e.message : 'Failed to load loans.'),
      );

  useEffect(() => {
    loadLoans();
    getChartOfAccounts('includeInactive=false')
      .then((a) => setAccounts(a.filter((x) => !x.isHeader)))
      .catch(() => {});
    getBankAccounts()
      .then((b) => setBanks(b.filter((x) => x.status === 'active' && x.chartOfAccount)))
      .catch(() => {});
  }, []);

  async function openLoan(id: string) {
    setError('');
    try {
      setDetail(await getLoan(id));
      setMode('detail');
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to open loan.');
    }
  }

  async function run(fn: () => Promise<LoanDetail>) {
    setBusy(true);
    setError('');
    try {
      setDetail(await fn());
      await loadLoans();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Loans &amp; Amortization</h2>
      {error && (
        <div className="reports-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {mode === 'list' && (
        <LoanList
          loans={loans}
          onNew={() => {
            setDetail(null);
            setMode('new');
          }}
          onOpen={openLoan}
        />
      )}

      {mode === 'new' && (
        <NewLoanForm
          accounts={accounts}
          banks={banks}
          busy={busy}
          onCancel={() => setMode('list')}
          onCreate={async (input) => {
            setBusy(true);
            setError('');
            try {
              const created = await createLoan(input);
              setDetail(created);
              setMode('detail');
              await loadLoans();
            } catch (e) {
              setError(e instanceof AccountingApiError ? e.message : 'Failed to create loan.');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {mode === 'detail' && detail && (
        <LoanDetailView
          loan={detail}
          busy={busy}
          onBack={() => {
            setMode('list');
            loadLoans();
          }}
          onPost={() => run(() => postLoan(detail.id))}
          onCreateDv={(amId) => run(() => createLoanLineDv(detail.id, amId))}
          onMarkPaid={(amId, paid) => run(() => markLoanLinePaid(detail.id, amId, paid))}
          onDelete={async () => {
            if (!window.confirm(`Delete draft loan "${detail.name}"?`)) return;
            setBusy(true);
            try {
              await deleteLoan(detail.id);
              setMode('list');
              await loadLoans();
            } catch (e) {
              setError(e instanceof AccountingApiError ? e.message : 'Delete failed.');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ══════════════════ List ══════════════════
function LoanList({
  loans,
  onNew,
  onOpen,
}: {
  loans: LoanSummary[] | null;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <p className="reports-subtitle">
        Record loans payable and their amortization schedules. New loans book a drawdown when posted
        and compute the schedule; existing loans carry an uploaded schedule with no new entries. Pay
        each line with a Disbursement Voucher — it counts as paid once the cashier releases it.
      </p>
      <div style={{ marginBottom: 14 }}>
        <button type="button" className="acct-btn acct-btn--primary" onClick={onNew}>
          + New Loan
        </button>
      </div>
      {!loans ? (
        <div className="reports-loading">Loading…</div>
      ) : loans.length === 0 ? (
        <div className="reports-loading">No loans yet. Add one to build its schedule.</div>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Loan / Creditor</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Principal</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Paid / Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>{l.loanType === 'new' ? 'New (drawdown)' : 'Existing'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(l.principal)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {l.annualRatePct !== null ? `${l.annualRatePct}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {l.paid} / {l.total}
                  </td>
                  <td>
                    <span className="acct-badge">{l.status === 'posted' ? 'Posted' : 'Draft'}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="acct-btn acct-btn--sm"
                      onClick={() => onOpen(l.id)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ══════════════════ New loan form ══════════════════
function NewLoanForm({
  accounts,
  banks,
  busy,
  onCancel,
  onCreate,
}: {
  accounts: ChartOfAccount[];
  banks: BankAccount[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: CreateLoanInput) => void;
}) {
  const [loanType, setLoanType] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [loansPayable, setLoansPayable] = useState('');
  const [interestExpense, setInterestExpense] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [remarks, setRemarks] = useState('');
  // new-loan terms
  const [ratePct, setRatePct] = useState('');
  const [termValue, setTermValue] = useState('');
  const [termUnit, setTermUnit] = useState<'years' | 'months'>('years');
  const [freq, setFreq] = useState('monthly');
  const [method, setMethod] = useState('annuity');
  const [startDate, setStartDate] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  // existing-loan schedule
  const [csv, setCsv] = useState('');

  const parsed = useMemo(
    () => (loanType === 'existing' ? parseSchedule(csv, parseFloat(principal) || 0) : null),
    [loanType, csv, principal],
  );

  const input: React.CSSProperties = {
    padding: '7px 9px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    fontSize: 13,
    boxSizing: 'border-box',
    width: '100%',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#344054' };
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

  const submit = () => {
    const base: CreateLoanInput = {
      loanType,
      name: name.trim(),
      principal: parseFloat(principal) || 0,
      loansPayableAccountId: loansPayable,
      interestExpenseAccountId: interestExpense,
      bankAccountId,
      ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
    };
    if (loanType === 'new') {
      const termYears =
        termUnit === 'years' ? parseFloat(termValue) || 0 : (parseFloat(termValue) || 0) / 12;
      const termPeriods = Math.round(termYears * FREQ[freq]!.perYear);
      onCreate({
        ...base,
        annualRatePct: parseFloat(ratePct) || 0,
        termPeriods,
        frequency: freq,
        method,
        ...(startDate ? { startDate } : {}),
        ...(firstPaymentDate ? { firstPaymentDate } : {}),
      });
    } else {
      onCreate({ ...base, schedule: parsed?.rows ?? [] });
    }
  };

  const canSubmit =
    name.trim() &&
    (parseFloat(principal) || 0) > 0 &&
    loansPayable &&
    interestExpense &&
    bankAccountId &&
    (loanType === 'new'
      ? (parseFloat(termValue) || 0) > 0
      : (parsed?.rows.length ?? 0) > 0 && !parsed?.error);

  return (
    <>
      <button
        type="button"
        className="acct-btn acct-btn--sm"
        onClick={onCancel}
        style={{ marginBottom: 12 }}
      >
        ← Back to loans
      </button>
      <h3 style={{ fontSize: 16, margin: '0 0 10px' }}>New Loan</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['new', 'existing'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`acct-btn acct-btn--sm${loanType === t ? ' acct-btn--primary' : ''}`}
            onClick={() => setLoanType(t)}
          >
            {t === 'new' ? 'New loan (record drawdown)' : 'Existing loan (upload schedule)'}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          maxWidth: 900,
          marginBottom: 14,
        }}
      >
        <div style={{ ...field, gridColumn: '1 / -1', maxWidth: 420 }}>
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
          />
        </div>
        <div style={field}>
          <span style={label}>Loans Payable account (credit)</span>
          <AccountCombobox accounts={accounts} value={loansPayable} onChange={setLoansPayable} />
        </div>
        <div style={field}>
          <span style={label}>Interest Expense account</span>
          <AccountCombobox
            accounts={accounts}
            value={interestExpense}
            onChange={setInterestExpense}
          />
        </div>
        <div style={field}>
          <span style={label}>Paying bank account</span>
          <select
            style={input}
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          >
            <option value="">Select…</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {bankAccountLabel(b)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loanType === 'new' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            maxWidth: 900,
            marginBottom: 14,
          }}
        >
          <div style={field}>
            <span style={label}>Annual interest rate (%)</span>
            <input
              style={input}
              type="number"
              min="0"
              step="0.001"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
            />
          </div>
          <div style={field}>
            <span style={label}>Term</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...input, flex: 1 }}
                type="number"
                min="0"
                value={termValue}
                onChange={(e) => setTermValue(e.target.value)}
              />
              <select
                style={{ ...input, width: 92 }}
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
            <select style={input} value={freq} onChange={(e) => setFreq(e.target.value)}>
              {Object.keys(FREQ).map((f) => (
                <option key={f} value={f}>
                  {FREQ[f]!.label}
                </option>
              ))}
            </select>
          </div>
          <div style={field}>
            <span style={label}>Method</span>
            <select style={input} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="annuity">Equal payment (annuity)</option>
              <option value="straight">Equal principal (straight-line)</option>
            </select>
          </div>
          <div style={field}>
            <span style={label}>Drawdown / start date</span>
            <input
              style={input}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div style={field}>
            <span style={label}>First payment date</span>
            <input
              style={input}
              type="date"
              value={firstPaymentDate}
              onChange={(e) => setFirstPaymentDate(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 900, marginBottom: 14 }}>
          <span style={label}>Paste the amortization schedule (CSV)</span>
          <textarea
            style={{ ...input, minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={
              'Due Date,Principal,Interest,Payment\n2026-01-31,20000,5000,25000\n2026-02-28,20200,4800,25000'
            }
          />
          {parsed?.error ? (
            <div style={{ color: '#b42318', fontSize: 12, marginTop: 6 }}>{parsed.error}</div>
          ) : parsed && parsed.rows.length > 0 ? (
            <div style={{ color: '#067647', fontSize: 12, marginTop: 6 }}>
              {parsed.rows.length} schedule line{parsed.rows.length === 1 ? '' : 's'} parsed.
            </div>
          ) : null}
        </div>
      )}

      <div style={field}>
        <span style={label}>Remarks (optional)</span>
        <input
          style={{ ...input, maxWidth: 600 }}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="acct-btn acct-btn--primary"
          disabled={!canSubmit || busy}
          onClick={submit}
        >
          {busy ? 'Saving…' : 'Create loan'}
        </button>
      </div>
    </>
  );
}

// ══════════════════ Detail ══════════════════
function LoanDetailView({
  loan,
  busy,
  onBack,
  onPost,
  onCreateDv,
  onMarkPaid,
  onDelete,
}: {
  loan: LoanDetail;
  busy: boolean;
  onBack: () => void;
  onPost: () => void;
  onCreateDv: (amId: string) => void;
  onMarkPaid: (amId: string, paid: boolean) => void;
  onDelete: () => void;
}) {
  const posted = loan.status === 'posted';
  const totals = loan.amortizations.reduce(
    (t, a) => ({
      payment: t.payment + a.payment,
      interest: t.interest + a.interest,
      principal: t.principal + a.principal,
    }),
    { payment: 0, interest: 0, principal: 0 },
  );

  return (
    <>
      <button
        type="button"
        className="acct-btn acct-btn--sm"
        onClick={onBack}
        style={{ marginBottom: 12 }}
      >
        ← Back to loans
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 6,
        }}
      >
        <h3 style={{ fontSize: 17, margin: 0 }}>{loan.name}</h3>
        <span className="acct-badge">{posted ? 'Posted' : 'Draft'}</span>
        <span style={{ fontSize: 12, color: '#667085' }}>
          {loan.loanType === 'new' ? 'New loan (drawdown)' : 'Existing loan'}
        </span>
      </div>
      <p className="reports-subtitle" style={{ marginBottom: 10 }}>
        {formatPeso(loan.principal)} principal
        {loan.annualRatePct !== null ? ` · ${loan.annualRatePct}% p.a.` : ''} · Loans Payable{' '}
        <strong>{loan.accounts.loansPayable}</strong> · Interest{' '}
        <strong>{loan.accounts.interestExpense}</strong> · Bank{' '}
        <strong>{loan.accounts.bank}</strong>
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {!posted && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            disabled={busy}
            onClick={onPost}
          >
            {loan.loanType === 'new' ? '✓ Post loan (record drawdown)' : '✓ Post loan'}
          </button>
        )}
        {!posted && (
          <button
            type="button"
            className="acct-btn"
            disabled={busy}
            onClick={onDelete}
            style={{ color: '#b42318' }}
          >
            Delete draft
          </button>
        )}
        {posted && loan.drawdownJevId && (
          <span style={{ fontSize: 12, color: '#067647', alignSelf: 'center' }}>
            ✓ Drawdown recorded to the general ledger.
          </span>
        )}
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>#</th>
              <th>Due Date</th>
              <th style={{ textAlign: 'right' }}>Beginning</th>
              <th style={{ textAlign: 'right' }}>Payment</th>
              <th style={{ textAlign: 'right' }}>Interest</th>
              <th style={{ textAlign: 'right' }}>Principal</th>
              <th style={{ textAlign: 'right' }}>Ending</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loan.amortizations.map((a) => {
              const st = STATUS[a.status]!;
              return (
                <tr key={a.id}>
                  <td style={{ textAlign: 'right' }}>{a.seq}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(a.dueDate).toLocaleDateString('en-PH')}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(a.beginningBalance)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(a.payment)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(a.interest)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(a.principal)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPeso(a.endingBalance)}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        color: st.color,
                        background: st.bg,
                      }}
                    >
                      {st.label}
                    </span>
                    {a.dvNumber && (
                      <span style={{ fontSize: 11, color: '#667085', marginLeft: 6 }}>
                        {a.dvNumber}
                      </span>
                    )}
                  </td>
                  <td>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      {posted && !a.paidManual && a.status !== 'paid' && !a.dvId && (
                        <button
                          type="button"
                          className="acct-btn acct-btn--sm"
                          disabled={busy}
                          onClick={() => onCreateDv(a.id)}
                          title="Create a Disbursement Voucher to pay this line"
                        >
                          Create DV
                        </button>
                      )}
                      {a.dvId && (
                        <a
                          className="acct-btn acct-btn--sm"
                          href={`/accounting/disbursements/${a.dvId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View DV
                        </a>
                      )}
                      {posted && a.status !== 'for_payment' && (
                        <button
                          type="button"
                          className="acct-btn acct-btn--sm"
                          disabled={busy}
                          onClick={() => onMarkPaid(a.id, !a.paidManual)}
                          title="Manually mark this line as paid / unpaid"
                        >
                          {a.paidManual ? 'Unmark paid' : 'Mark paid'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>
                Total
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {formatPeso(totals.payment)}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {formatPeso(totals.interest)}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {formatPeso(totals.principal)}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
