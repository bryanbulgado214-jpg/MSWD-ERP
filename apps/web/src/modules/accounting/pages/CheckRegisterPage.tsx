import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';

import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';
import {
  getChecks,
  printCheck,
  transitionCheck,
  unclearCheck,
  updateCheckNumber,
  updateClearedDate,
  voidCheck,
} from '../api';
import { checkStatusDate, formatStatusDate, statusLabel } from '../status-format';
import type { CheckListItem } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

// ---- Date shortcut input (MM/DD/YYYY) --------------------------------------
// Lets the user type digits only — "021426" or "02142026" — and have it snap to
// 02/14/2026, while handing the parent an ISO (YYYY-MM-DD) value the API wants.
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

function isoFromParts(mm: number, dd: number, yyyy: number): string | null {
  if (!mm || !dd || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  // Reject impossible dates (e.g. 02/31) — JS would roll them over otherwise.
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${yyyy}-${p(mm)}-${p(dd)}`;
}

function parseDateDigits(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 8) {
    return isoFromParts(+digits.slice(0, 2), +digits.slice(2, 4), +digits.slice(4, 8));
  }
  if (digits.length === 6) {
    // MMDDYY — assume the 2000s.
    return isoFromParts(+digits.slice(0, 2), +digits.slice(2, 4), 2000 + +digits.slice(4, 6));
  }
  return null;
}

function formatDateWhileTyping(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function DateInput({
  value,
  onChange,
  autoFocus,
  style,
}: {
  value: string;
  onChange: (iso: string) => void;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  // Re-sync when the parent value changes (modal opened, year auto-completed…).
  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder="MM/DD/YYYY"
      value={text}
      onChange={(e) => {
        const shown = formatDateWhileTyping(e.target.value);
        setText(shown);
        const iso = parseDateDigits(shown);
        if (iso) onChange(iso);
        else if (e.target.value.replace(/\D/g, '') === '') onChange('');
      }}
      style={style}
    />
  );
}

const STATUS_OPTIONS = [
  '',
  'pending',
  'printed',
  'released',
  'cleared',
  'stale_dated',
  'spoiled',
  'voided',
];

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: CheckListItem[] };

type SortKey = 'checkNumber' | 'dvNumber' | 'date' | 'payee';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

export default function CheckRegisterPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const canPrint = permissions.has('accounting.check.print');
  const canRelease = permissions.has('accounting.check.record_release');
  const canVoid = permissions.has('accounting.check.void');
  // Only the cashier acts on checks (print, edit #, release, clear, void). The
  // accountant's view is read-only, so the Actions column is hidden for them.
  const hasActions = canPrint || canRelease || canVoid;
  // Checks vs ADA (bank debits) — two tabs over the same register, filtered by
  // the paying DV's payment mode.
  const [tab, setTab] = useState<'check' | 'ada'>('check');

  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [filterBank, setFilterBank] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Stable list of every bank seen so far — so re-filtering by one bank never
  // drops the others from the dropdown (see bankOptions below).
  const [bankSeen, setBankSeen] = useState<Map<string, string>>(new Map());

  // Cashier print modal
  const [printTarget, setPrintTarget] = useState<CheckListItem | null>(null);
  const [printNumber, setPrintNumber] = useState('');
  const [printDate, setPrintDate] = useState(new Date().toISOString().slice(0, 10));
  const [printError, setPrintError] = useState('');
  const [printing, setPrinting] = useState(false);

  // Cleared-date modal (date picker, min = DV date)
  const [clearTarget, setClearTarget] = useState<CheckListItem | null>(null);
  const [clearDate, setClearDate] = useState(new Date().toISOString().slice(0, 10));
  const [clearError, setClearError] = useState('');
  const [clearing, setClearing] = useState(false);
  // Optional physical check number captured when clearing a pre-printed check.
  const [clearCheckNumber, setClearCheckNumber] = useState('');
  // The clear modal doubles as an "edit cleared date" correction for an
  // already-cleared check/ADA.
  const [clearIsEdit, setClearIsEdit] = useState(false);

  const loadChecks = useCallback(() => {
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    params.set('paymentMode', tab === 'ada' ? 'ada' : 'check');
    if (filterBank) params.set('bankAccountId', filterBank);
    if (filterStatus) params.set('status', filterStatus);
    if (search.trim()) params.set('search', search.trim());
    getChecks(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [filterBank, filterStatus, search, tab]);

  // Debounced auto-load: any filter/search change reloads after a short pause,
  // so typing in the search box filters live without pressing Enter.
  useEffect(() => {
    const t = setTimeout(loadChecks, 250);
    return () => clearTimeout(t);
  }, [loadChecks]);

  const checks = state.status === 'loaded' ? state.data : [];

  // Accumulate the banks seen across loads. The cashier has no broad
  // accounting.read to list bank accounts, so options come from the checks —
  // but we must NOT drop a bank just because the current filter hides its rows,
  // otherwise re-filtering by one bank empties the dropdown of the rest.
  useEffect(() => {
    if (state.status !== 'loaded') return;
    setBankSeen((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const c of state.data) {
        const label = `${c.bankAccount.bank.code} — ${c.bankAccount.accountName}`;
        if (next.get(c.bankAccount.id) !== label) {
          next.set(c.bankAccount.id, label);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state]);

  const bankOptions = useMemo(
    () =>
      [...bankSeen.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [bankSeen],
  );

  const hasFilters = !!(filterBank || filterStatus || search.trim());

  function clearFilters() {
    setFilterBank('');
    setFilterStatus('');
    setSearch('');
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const sortIndicator = (key: SortKey) => (sort?.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const sortedChecks = useMemo(() => {
    if (!sort) return checks;
    const getVal = (c: CheckListItem): string | null => {
      switch (sort.key) {
        case 'checkNumber':
          return c.checkNumber;
        case 'dvNumber':
          return c.disbursementVoucher?.dvNumber ?? null;
        case 'date':
          return c.checkDate;
        case 'payee':
          return c.payeeName;
      }
    };
    return [...checks].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      const aEmpty = av == null || av === '';
      const bEmpty = bv == null || bv === '';
      // Empty values (e.g. a pending check with no number) always sort last.
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let cmp: number;
      if (sort.key === 'date') {
        cmp = new Date(av as string).getTime() - new Date(bv as string).getTime();
      } else if (sort.key === 'payee') {
        cmp = (av as string).localeCompare(bv as string, undefined, { sensitivity: 'base' });
      } else {
        // check # / DV # — natural numeric order ("2605196" < "2605213").
        cmp = (av as string).localeCompare(bv as string, undefined, { numeric: true });
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [checks, sort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadChecks();
  };

  function openPrint(check: CheckListItem) {
    setPrintTarget(check);
    setPrintNumber('');
    setPrintDate(new Date().toISOString().slice(0, 10));
    setPrintError('');
  }

  async function confirmPrint() {
    if (!printTarget || !printNumber.trim()) return;
    setPrinting(true);
    setPrintError('');
    try {
      await printCheck(printTarget.id, { checkNumber: printNumber.trim(), checkDate: printDate });
      const id = printTarget.id;
      setPrintTarget(null);
      navigate(`/accounting/checks/${id}/print`);
    } catch (err: any) {
      setPrintError(err.message);
    } finally {
      setPrinting(false);
    }
  }

  async function handleEditNumber(check: CheckListItem) {
    const next = window.prompt(
      `Correct the check number for ${check.disbursementVoucher?.dvNumber ?? 'this check'} (currently ${check.checkNumber ?? '—'}):`,
      check.checkNumber ?? '',
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === check.checkNumber) return;
    setActionError('');
    setBusy(check.id);
    try {
      await updateCheckNumber(check.id, { checkNumber: trimmed });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRelease(check: CheckListItem, toStatus: 'released' | 'cleared') {
    setActionError('');
    if (toStatus === 'cleared') {
      // Clearing needs a bank-clearing date — open the date-picker modal
      // (defaults to today; the modal enforces "not before the DV date").
      setClearError('');
      const dvDay = check.disbursementVoucher?.dvDate?.slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      setClearDate(dvDay && dvDay > today ? dvDay : today);
      setClearCheckNumber('');
      setClearIsEdit(false);
      setClearTarget(check);
      return;
    }
    setBusy(check.id);
    try {
      await transitionCheck(check.id, { expectedVersion: check.version, toStatus });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // Open the modal to correct the cleared date of an already-cleared check/ADA.
  function openEditClearedDate(check: CheckListItem) {
    setClearError('');
    setClearIsEdit(true);
    setClearCheckNumber('');
    setClearDate(check.clearedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setClearTarget(check);
  }

  async function confirmClear() {
    if (!clearTarget) return;
    const dvDay = clearTarget.disbursementVoucher?.dvDate?.slice(0, 10);
    if (dvDay && clearDate < dvDay) {
      setClearError(`Clearing date cannot be before the DV date (${dvDay}).`);
      return;
    }
    setClearing(true);
    setClearError('');
    try {
      if (clearIsEdit) {
        await updateClearedDate(clearTarget.id, {
          expectedVersion: clearTarget.version,
          clearedDate: clearDate,
        });
      } else {
        await transitionCheck(clearTarget.id, {
          expectedVersion: clearTarget.version,
          toStatus: 'cleared',
          clearedDate: clearDate,
          ...(clearCheckNumber.trim() ? { checkNumber: clearCheckNumber.trim() } : {}),
        });
      }
      setClearTarget(null);
      loadChecks();
    } catch (err: any) {
      setClearError(err.message);
    } finally {
      setClearing(false);
    }
  }

  // Reverse an erroneous clearing: the check/ADA goes back to "released" so it
  // can be re-cleared with the correct date.
  async function handleUnclear(check: CheckListItem) {
    setActionError('');
    const label = check.disbursementVoucher?.paymentMode === 'ada' ? 'ADA' : 'check';
    if (
      !window.confirm(
        `Un-clear this ${label}? It will go back to "released" (awaiting clearing) and its cleared date will be removed. You can then mark it cleared again with the correct date.`,
      )
    ) {
      return;
    }
    setBusy(check.id);
    try {
      await unclearCheck(check.id, { expectedVersion: check.version });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleVoid(check: CheckListItem, toStatus: 'voided' | 'spoiled') {
    setActionError('');
    const remarks =
      prompt(
        `Reason to ${toStatus === 'spoiled' ? 'spoil' : 'void'} check ${check.checkNumber ?? ''}:`,
      ) ?? '';
    if (!remarks.trim()) return;
    setBusy(check.id);
    try {
      await voidCheck(check.id, {
        expectedVersion: check.version,
        toStatus,
        remarks: remarks.trim(),
      });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1>Check Register</h1>
        {canPrint && (
          <Link
            to="/accounting/checks/alignment"
            className="acct-table__link"
            style={{ fontSize: 13 }}
            title="Calibrate where data prints on the pre-printed check"
          >
            Check Alignment →
          </Link>
        )}
      </div>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 16, maxWidth: 780 }}>
        Every check is backed by a Disbursement Voucher — checks are never created manually. A DV
        paid by check appears here as <strong>pending</strong>; the cashier assigns the check number
        and prints it. Voiding a check requires the General Manager (and never the person who
        printed or released it). ADA debits appear here without a check number — they are released
        as soon as the DV is posted, and you mark them cleared once the debit reflects in the bank
        passbook.
        {!canPrint && !canVoid && ' (You have view-only access.)'}
      </p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e4e7ec', marginBottom: 14 }}>
        {(['check', 'ada'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              color: tab === t ? 'var(--mswd-navy, #0b2e63)' : '#667085',
              borderBottom:
                tab === t ? '2px solid var(--mswd-navy, #0b2e63)' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'check' ? 'Checks' : 'ADA (bank debits)'}
          </button>
        ))}
      </div>

      <div className="acct-toolbar">
        <select
          value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}
          style={{ width: '100%', maxWidth: 260, boxSizing: 'border-box' }}
        >
          <option value="">All Bank Accounts</option>
          {bankOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s.replace(/_/g, ' ') : 'All Statuses'}
            </option>
          ))}
        </select>
        <form onSubmit={handleSearch} style={{ display: 'contents' }}>
          <input
            type="text"
            placeholder="Search check#, payee, or amount..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <button
          type="button"
          className="acct-btn acct-btn--sm"
          onClick={clearFilters}
          disabled={!hasFilters}
          title="Clear the bank, status, and search filters"
        >
          Clear filters
        </button>
      </div>

      {actionError && <div className="acct-error">{actionError}</div>}

      {clearTarget && (
        <div
          onClick={() => setClearTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: 420,
              maxWidth: '92vw',
              boxShadow: '0 10px 40px rgba(16,24,40,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>
              {clearIsEdit
                ? 'Edit Cleared Date'
                : clearTarget.disbursementVoucher?.paymentMode === 'ada'
                  ? 'Mark ADA Cleared'
                  : 'Mark Check Cleared'}
            </h2>
            <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 16px' }}>
              {clearTarget.disbursementVoucher?.dvNumber} ·{' '}
              {clearTarget.checkNumber ??
                (clearTarget.disbursementVoucher?.paymentMode === 'ada' ? 'ADA' : '')}{' '}
              · {formatPeso(clearTarget.amount)}
            </p>
            {clearError && (
              <div className="acct-error" style={{ marginBottom: 12 }}>
                {clearError}
              </div>
            )}
            {!clearIsEdit &&
              clearTarget.disbursementVoucher?.paymentMode !== 'ada' &&
              !clearTarget.checkNumber && (
              <>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#344054',
                    marginBottom: 4,
                  }}
                >
                  Check number{' '}
                  <span style={{ fontWeight: 400, color: '#667085' }}>
                    (if already printed — optional)
                  </span>
                </label>
                <input
                  value={clearCheckNumber}
                  onChange={(e) => setClearCheckNumber(e.target.value)}
                  placeholder="e.g. DBP-0004851"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #d0d5dd',
                    borderRadius: 6,
                    fontSize: 13,
                    boxSizing: 'border-box',
                    marginBottom: 12,
                  }}
                />
              </>
            )}
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                marginBottom: 4,
              }}
            >
              Clearing Date *
            </label>
            <DateInput
              autoFocus
              value={clearDate}
              onChange={setClearDate}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 6,
              }}
            />
            {clearTarget.disbursementVoucher?.dvDate && (
              <p style={{ fontSize: 11.5, color: '#667085', margin: '0 0 16px' }}>
                Cannot be before the DV date ({clearTarget.disbursementVoucher.dvDate.slice(0, 10)}
                ).
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="acct-btn"
                onClick={() => setClearTarget(null)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                onClick={confirmClear}
                disabled={clearing || !clearDate}
              >
                {clearing ? 'Saving…' : clearIsEdit ? 'Save date' : 'Mark Cleared'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printTarget && (
        <div
          onClick={() => setPrintTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: 420,
              maxWidth: '92vw',
              boxShadow: '0 10px 40px rgba(16,24,40,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>Print Check</h2>
            <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 16px' }}>
              {printTarget.disbursementVoucher?.dvNumber} · {printTarget.payeeName} ·{' '}
              {formatPeso(printTarget.amount)}
            </p>
            {printError && (
              <div className="acct-error" style={{ marginBottom: 12 }}>
                {printError}
              </div>
            )}
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                marginBottom: 4,
              }}
            >
              Check Number *
            </label>
            <input
              autoFocus
              value={printNumber}
              onChange={(e) => setPrintNumber(e.target.value)}
              placeholder="e.g. DBP-0004851"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
            />
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                marginBottom: 4,
              }}
            >
              Check Date
            </label>
            <DateInput
              value={printDate}
              onChange={setPrintDate}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 20,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="acct-btn" onClick={() => setPrintTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                disabled={!printNumber.trim() || printing}
                onClick={confirmPrint}
              >
                {printing ? 'Printing...' : 'Assign & Print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && checks.length === 0 && (
        <div className="acct-empty">
          {tab === 'ada'
            ? 'No ADA debits. An ADA-paid disbursement voucher appears here — no check is printed; mark it cleared once it reflects in the bank passbook.'
            : 'No checks found. Checks appear here when a check-paid DV is prepared.'}
        </div>
      )}

      {state.status === 'loaded' && checks.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th
                  onClick={() => toggleSort('checkNumber')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by check number"
                >
                  Check #{sortIndicator('checkNumber')}
                </th>
                <th
                  onClick={() => toggleSort('dvNumber')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by DV number"
                >
                  DV #{sortIndicator('dvNumber')}
                </th>
                <th
                  onClick={() => toggleSort('date')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by date"
                >
                  Date{sortIndicator('date')}
                </th>
                <th
                  onClick={() => toggleSort('payee')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Sort by payee"
                >
                  Payee{sortIndicator('payee')}
                </th>
                <th>Bank</th>
                <th className="acct-text-right">Amount</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                {hasActions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sortedChecks.map((c) => {
                const dvDraft = c.disbursementVoucher?.status === 'draft';
                const isPending = c.status === 'pending';
                // An ADA debit has no printed check — it is released on posting and
                // the cashier only marks it cleared when it reflects in the passbook.
                const isAda = c.disbursementVoucher?.paymentMode === 'ada';
                const voidable = canVoid && !['voided', 'spoiled', 'cleared'].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>
                      {c.checkNumber ?? (
                        <span style={{ color: '#98a2b3', fontStyle: 'italic', fontWeight: 400 }}>
                          {isAda ? 'ADA' : '— pending —'}
                        </span>
                      )}
                    </td>
                    <td>
                      {c.disbursementVoucher ? (
                        <Link
                          to={`/accounting/disbursements/${c.disbursementVoucher.id}/print`}
                          className="acct-table__link"
                        >
                          {c.disbursementVoucher.dvNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(c.checkDate).toLocaleDateString()}
                    </td>
                    <td>{c.payeeName}</td>
                    <td>
                      {c.bankAccount.bank.code} — {c.bankAccount.accountName}
                    </td>
                    <td className="acct-text-right acct-text-mono">{formatPeso(c.amount)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <span className={`acct-badge acct-badge--${c.status}`}>
                          {statusLabel(c.status, { isAda })}
                        </span>
                        {/* For an ADA, only show a date once it has cleared (the
                            passbook date); before that it is simply "For Clearing". */}
                        {(isAda ? c.status === 'cleared' : true) && checkStatusDate(c) && (
                          <span style={{ color: '#667085', fontSize: 12 }}>
                            {formatStatusDate(checkStatusDate(c))}
                          </span>
                        )}
                      </div>
                    </td>
                    {hasActions && (
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          {isPending && canPrint && !dvDraft && !isAda && (
                            <button
                              className="acct-btn acct-btn--sm acct-btn--primary"
                              onClick={() => openPrint(c)}
                            >
                              Print Check
                            </button>
                          )}
                          {/* Already printed outside AquaBooks (historical entry):
                              clear it without printing so it leaves "pending". */}
                          {isPending && canRelease && !dvDraft && !isAda && (
                            <button
                              className="acct-btn acct-btn--sm"
                              title="Check was already printed outside AquaBooks — mark it cleared without printing"
                              disabled={busy === c.id}
                              onClick={() => handleRelease(c, 'cleared')}
                            >
                              Mark cleared (already printed)
                            </button>
                          )}
                          {isPending && dvDraft && (
                            <span style={{ fontSize: 11, color: '#98a2b3' }}>
                              DV not yet posted
                            </span>
                          )}
                          {/* ADA: released on posting, awaiting the passbook. The
                              cashier marks it cleared with the debit date. */}
                          {isAda &&
                            !dvDraft &&
                            canRelease &&
                            !['cleared', 'voided', 'spoiled'].includes(c.status) && (
                              <button
                                className="acct-btn acct-btn--sm acct-btn--primary"
                                disabled={busy === c.id}
                                onClick={() => handleRelease(c, 'cleared')}
                              >
                                Cleared
                              </button>
                            )}
                          {!isPending && canPrint && !isAda && (
                            <Link
                              to={`/accounting/checks/${c.id}/print`}
                              className="acct-table__link"
                            >
                              Print
                            </Link>
                          )}
                          {canPrint &&
                            !isAda &&
                            c.checkNumber &&
                            !['cleared', 'stale_dated', 'voided', 'spoiled'].includes(c.status) && (
                              <button
                                className="acct-btn acct-btn--sm"
                                title="Correct the check number (e.g. after a print jam)"
                                disabled={busy === c.id}
                                onClick={() => handleEditNumber(c)}
                              >
                                Edit #
                              </button>
                            )}
                          {canRelease && c.status === 'printed' && (
                            <button
                              className="acct-btn acct-btn--sm"
                              disabled={busy === c.id}
                              onClick={() => handleRelease(c, 'released')}
                            >
                              release
                            </button>
                          )}
                          {canRelease && !isAda && c.status === 'released' && (
                            <button
                              className="acct-btn acct-btn--sm"
                              disabled={busy === c.id}
                              onClick={() => handleRelease(c, 'cleared')}
                            >
                              cleared
                            </button>
                          )}
                          {canRelease && c.status === 'cleared' && (
                            <button
                              className="acct-btn acct-btn--sm"
                              title="Correct the date this cleared the bank"
                              disabled={busy === c.id}
                              onClick={() => openEditClearedDate(c)}
                            >
                              Edit date
                            </button>
                          )}
                          {canRelease && c.status === 'cleared' && (
                            <button
                              className="acct-btn acct-btn--sm"
                              title="Reverse an accidental clearing — sends it back to released"
                              disabled={busy === c.id}
                              onClick={() => handleUnclear(c)}
                            >
                              Unclear
                            </button>
                          )}
                          {voidable && (
                            <button
                              className="acct-btn acct-btn--sm acct-btn--danger"
                              disabled={busy === c.id}
                              onClick={() => handleVoid(c, 'voided')}
                            >
                              void
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
