import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AccountCombobox } from './AccountCombobox';
import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';
import {
  getReconciliations,
  createReconciliation,
  deleteReconciliation,
  getChartOfAccounts,
  getGlCashBalance,
  getMatchView,
  importBankStatement,
  matchLines,
  autoMatchBankLines,
  unmatchGroup,
  createEntryFromBankLine,
  completeReconciliation,
  getBankAccounts,
  getGlFiscalYears,
  getGlPeriods,
  getReconAttachments,
  uploadReconAttachment,
  downloadReconAttachment,
  type MatchView,
  type ReconAttachment,
} from '../api';
import { parseBankCsv, formatBytes, type ParsedTxn } from '../bank-csv';
import type {
  BankReconciliationListItem,
  BankAccount,
  ChartOfAccount,
  FiscalYearOption,
  PeriodOption,
} from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Distinct colours for match groups on the Reconciled tab (cycled).
const GROUP_COLORS = ['#175cd3', '#067647', '#b54708', '#6941c6', '#c11574', '#0e7490', '#a15c07'];

// Case-insensitive substring match; empty query matches everything. Callers
// build a "haystack" that includes the raw amount, the grouped amount
// (e.g. "3,500,000"), the date and any references, so users can search by
// keyword OR by amount.
function matchesQuery(hay: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || hay.toLowerCase().includes(needle);
}
function amountHay(amount: number): string {
  return `${amount} ${Math.abs(amount).toLocaleString('en-US')} ${Math.abs(amount).toLocaleString(
    'en-US',
    { minimumFractionDigits: 2 },
  )}`;
}

// Search input with an inline clear (×) button, shown once there is text.
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 120, position: 'relative', display: 'flex' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '4px 26px 4px 8px',
          border: '1px solid #d0d5dd',
          borderRadius: 6,
          fontSize: 12.5,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          title="Clear"
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: '50%',
            background: '#e4e7ec',
            color: '#475467',
            fontSize: 13,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── List View ──

function ReconciliationList() {
  const navigate = useNavigate();
  const [list, setList] = useState<BankReconciliationListItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [filterBank, setFilterBank] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [formData, setFormData] = useState({
    bankAccountId: '',
    accountingPeriodId: '',
    reconciliationDate: '',
    bookBalance: '',
    bankBalance: '',
  });
  const [formError, setFormError] = useState('');
  const [bookLoading, setBookLoading] = useState(false);
  const [lastReconciled, setLastReconciled] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getBankAccounts().then(setBankAccounts);
    getGlFiscalYears().then((fy) => {
      setFiscalYears(fy);
      if (fy.length > 0) setSelectedFY(fy[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedFY) getGlPeriods(selectedFY).then(setPeriods);
  }, [selectedFY]);

  // Book balance is derived from the GL: the bank's cash-in-bank balance as at
  // the reconciliation date. Fetched (not typed) whenever both are chosen.
  useEffect(() => {
    if (!formData.bankAccountId || !formData.reconciliationDate || !formData.accountingPeriodId) {
      setFormData((f) => ({ ...f, bookBalance: '' }));
      return;
    }
    setBookLoading(true);
    getGlCashBalance(
      formData.bankAccountId,
      formData.reconciliationDate,
      formData.accountingPeriodId,
    )
      .then((r) => setFormData((f) => ({ ...f, bookBalance: String(r.bookBalance) })))
      .catch(() => setFormData((f) => ({ ...f, bookBalance: '' })))
      .finally(() => setBookLoading(false));
  }, [formData.bankAccountId, formData.reconciliationDate, formData.accountingPeriodId]);

  // "Last reconciled as of ..." — the reconciliation date of the most recent
  // approved reconciliation for the chosen bank account.
  useEffect(() => {
    if (!formData.bankAccountId) {
      setLastReconciled(null);
      return;
    }
    getReconciliations(`bankAccountId=${formData.bankAccountId}`)
      .then((recs) => {
        const approved = recs
          .filter((r) => r.status === 'approved')
          .sort(
            (a, b) =>
              new Date(b.reconciliationDate).getTime() - new Date(a.reconciliationDate).getTime(),
          );
        setLastReconciled(approved[0]?.reconciliationDate ?? null);
      })
      .catch(() => setLastReconciled(null));
  }, [formData.bankAccountId]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterBank) params.set('bankAccountId', filterBank);
    getReconciliations(params.toString())
      .then(setList)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterBank]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const result = await createReconciliation({
        bankAccountId: formData.bankAccountId,
        accountingPeriodId: formData.accountingPeriodId,
        reconciliationDate: formData.reconciliationDate,
        bookBalance: parseFloat(formData.bookBalance) || 0,
        bankBalance: parseFloat(formData.bankBalance) || 0,
      });
      navigate(`/accounting/reconciliations/${result.id}`);
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleDelete = async (r: BankReconciliationListItem) => {
    if (
      !window.confirm(
        `Delete the ${r.accountingPeriod.name} reconciliation for ${r.bankAccount.bank.code} — ${r.bankAccount.accountName}?\n\n` +
          `Every book entry it cleared will be UNMATCHED and returned to the uncleared list. ` +
          `Imported bank lines are removed. Posted journal entries you added via “Add to books” stay in the GL.\n\n` +
          `This cannot be undone.`,
      )
    )
      return;
    setDeletingId(r.id);
    try {
      const res = await deleteReconciliation(r.id);
      setList((prev) => prev.filter((x) => x.id !== r.id));
      window.alert(
        res.unmatchedBookLines > 0
          ? `Reconciliation deleted. ${res.unmatchedBookLines} book entr${res.unmatchedBookLines === 1 ? 'y was' : 'ies were'} unmatched.`
          : 'Reconciliation deleted.',
      );
    } catch (err: any) {
      window.alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <h1>Bank Reconciliations</h1>

      <div className="acct-toolbar">
        <select
          value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}
          style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
        >
          <option value="">All Bank Accounts</option>
          {bankAccounts.map((ba) => (
            <option key={ba.id} value={ba.id}>
              {ba.bank.code} — {ba.accountName}
            </option>
          ))}
        </select>
        <button className="acct-btn acct-btn--primary" onClick={() => setShowForm(!showForm)}>
          + New Reconciliation
        </button>
      </div>

      {showForm && (
        <form className="acct-form" onSubmit={handleCreate}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Bank Account</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  required
                  style={{ maxWidth: 360, flex: '0 1 360px', boxSizing: 'border-box' }}
                >
                  <option value="">Select...</option>
                  {bankAccounts
                    .filter((ba) => ba.status === 'active')
                    .map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.bank.code} — {ba.accountName}
                      </option>
                    ))}
                </select>
                {formData.bankAccountId && (
                  <span style={{ fontSize: 12.5, color: lastReconciled ? '#067647' : '#b54708' }}>
                    {lastReconciled
                      ? `Last reconciled as of ${new Date(lastReconciled).toLocaleDateString('en-PH')}`
                      : 'No prior reconciliation'}
                  </span>
                )}
              </div>
            </div>
            <div className="acct-field">
              <label>Accounting Period</label>
              <select
                value={formData.accountingPeriodId}
                onChange={(e) => setFormData({ ...formData, accountingPeriodId: e.target.value })}
                required
              >
                <option value="">Select...</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Reconciliation Date</label>
              <input
                type="date"
                value={formData.reconciliationDate}
                onChange={(e) => setFormData({ ...formData, reconciliationDate: e.target.value })}
                required
              />
            </div>
            <div className="acct-field">
              <label>Book Balance (per GL) — auto</label>
              <input
                type="text"
                readOnly
                value={
                  bookLoading
                    ? 'Computing…'
                    : formData.bookBalance !== ''
                      ? formatPeso(formData.bookBalance)
                      : ''
                }
                placeholder="Select bank account & date"
                style={{ background: '#f9fafb', color: '#344054' }}
              />
              <span style={{ fontSize: 11, color: '#667085' }}>
                From the GL cash account as at the reconciliation date.
              </span>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Bank Statement Balance</label>
              <input
                type="number"
                step="0.01"
                value={formData.bankBalance}
                onChange={(e) => setFormData({ ...formData, bankBalance: e.target.value })}
                required
              />
            </div>
            <div className="acct-field" />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="acct-btn acct-btn--primary">
              Create
            </button>
          </div>
        </form>
      )}

      {!showForm && loading && <div className="acct-empty">Loading...</div>}

      {!showForm && !loading && list.length === 0 && (
        <div className="acct-empty">No reconciliations found.</div>
      )}

      {!showForm && !loading && list.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Bank Account</th>
                <th>Date</th>
                <th className="acct-text-right">Book Bal.</th>
                <th className="acct-text-right">Bank Bal.</th>
                <th className="acct-text-right">Difference</th>
                <th>Status</th>
                <th className="acct-text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/accounting/reconciliations/${r.id}`} className="acct-table__link">
                      {r.accountingPeriod.name}
                    </Link>
                  </td>
                  <td>
                    {r.bankAccount.bank.code} — {r.bankAccount.accountName}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.reconciliationDate).toLocaleDateString()}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {formatPeso(r.adjustedBookBalance)}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {formatPeso(r.adjustedBankBalance)}
                  </td>
                  <td
                    className="acct-text-right acct-text-mono"
                    style={{
                      color: Math.abs(parseFloat(r.difference)) < 0.01 ? '#067647' : '#b42318',
                      fontWeight: 600,
                    }}
                  >
                    {Math.abs(parseFloat(r.difference)) < 0.01
                      ? 'Reconciled'
                      : formatPeso(r.difference)}
                  </td>
                  <td>
                    <span className={`acct-badge acct-badge--${r.status}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="acct-text-right">
                    <button
                      type="button"
                      className="acct-btn acct-btn--sm"
                      disabled={deletingId === r.id}
                      onClick={() => handleDelete(r)}
                      style={{ color: '#b42318' }}
                      title="Delete / undo this reconciliation and unmatch its entries"
                    >
                      {deletingId === r.id ? 'Deleting…' : 'Delete'}
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

// ── Detail View ──

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH');
}

function ReconciliationDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'unreconciled' | 'reconciled'>('unreconciled');
  const [selBank, setSelBank] = useState<Set<string>>(new Set()); // statementLineIds
  const [selBook, setSelBook] = useState<Set<string>>(new Set()); // jevLineIds
  const [bankSearch, setBankSearch] = useState('');
  const [bookSearch, setBookSearch] = useState('');

  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [csvRows, setCsvRows] = useState<ParsedTxn[]>([]);
  const [csvName, setCsvName] = useState('');
  const [importErr, setImportErr] = useState('');
  const [importing, setImporting] = useState(false);

  // Create-entry-from-line modal
  const [entryLine, setEntryLine] = useState<MatchView['bank'][number] | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [entryAccount, setEntryAccount] = useState('');
  const [entryDesc, setEntryDesc] = useState('');
  const [entryErr, setEntryErr] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<ReconAttachment[]>([]);
  const [uploadErr, setUploadErr] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => {
    getMatchView(id)
      .then(setView)
      .catch((e) => setError(e.message));
  };
  const loadAttachments = () => {
    getReconAttachments(id)
      .then(setAttachments)
      .catch(() => {
        /* optional */
      });
  };

  useEffect(() => {
    load();
    loadAttachments();
    getChartOfAccounts('includeInactive=false')
      .then((a) => setAccounts(a.filter((x) => !x.isHeader)))
      .catch(() => {
        /* accounts optional until create-entry */
      });
  }, [id]);

  if (error && !view) return <div className="acct-error">{error}</div>;
  if (!view) return <div className="acct-empty">Loading…</div>;

  const { recon, bank, book, summary } = view;
  const editable = recon.status === 'in_progress' || recon.status === 'draft';

  const bankUnmatched = bank.filter((b) => !b.matched);
  const bankMatched = bank.filter((b) => b.matched);
  const bookUnmatched = book.filter((b) => !b.matched);
  const bookMatched = book.filter((b) => b.matched);

  // Selected (checked) lines — restricted to the unmatched pool.
  const selBankLines = bankUnmatched.filter((b) => selBank.has(b.id));
  const selBookLines = bookUnmatched.filter((b) => selBook.has(b.jevLineId));
  const selBankTotal = round2(selBankLines.reduce((s, b) => s + b.amount, 0));
  const selBookTotal = round2(selBookLines.reduce((s, b) => s + b.amount, 0));
  const matchDiff = round2(selBankTotal - selBookTotal);
  const canMatch = selBankLines.length > 0 && selBookLines.length > 0 && Math.abs(matchDiff) < 0.01;

  // Stable 1-based numbering + colour per match group, for the Reconciled tab.
  const groupOrder = Array.from(
    new Set(
      [...bankMatched, ...bookMatched]
        .map((x) => x.matchGroupId)
        .filter((g): g is string => g !== null),
    ),
  );
  const groupNo = new Map(groupOrder.map((g, i) => [g, i + 1]));

  async function run(fn: () => Promise<MatchView>) {
    setBusy(true);
    setError('');
    try {
      const next = await fn();
      setView(next);
      setSelBank(new Set());
      setSelBook(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const toggleBank = (lineId: string) =>
    setSelBank((prev) => {
      const n = new Set(prev);
      if (n.has(lineId)) n.delete(lineId);
      else n.add(lineId);
      return n;
    });
  const toggleBook = (lineId: string) =>
    setSelBook((prev) => {
      const n = new Set(prev);
      if (n.has(lineId)) n.delete(lineId);
      else n.add(lineId);
      return n;
    });

  const doMatch = () => {
    if (!canMatch) return;
    run(() =>
      matchLines(id, {
        statementLineIds: selBankLines.map((b) => b.id),
        jevLineIds: selBookLines.map((b) => b.jevLineId),
      }),
    );
  };

  const switchTab = (t: 'unreconciled' | 'reconciled') => {
    setTab(t);
    setSelBank(new Set());
    setSelBook(new Set());
  };

  // Rows shown in each column: the tab's set, filtered by that side's search box.
  const bankRows = (tab === 'unreconciled' ? bankUnmatched : bankMatched).filter((b) =>
    matchesQuery(
      `${b.description} ${b.referenceNumber ?? ''} ${fmtDate(b.transactionDate)} ${amountHay(b.amount)}`,
      bankSearch,
    ),
  );
  const bookRows = (tab === 'unreconciled' ? bookUnmatched : bookMatched).filter((b) =>
    matchesQuery(
      `${b.jevNumber} ${b.description} ${fmtDate(b.jevDate)} ${amountHay(b.amount)}`,
      bookSearch,
    ),
  );

  const groupChip = (gid: string | null) => {
    if (!gid) return null;
    const n = groupNo.get(gid) ?? 0;
    return (
      <span
        style={{
          display: 'inline-block',
          fontSize: 10.5,
          fontWeight: 700,
          color: '#fff',
          background: GROUP_COLORS[(n - 1) % GROUP_COLORS.length],
          borderRadius: 4,
          padding: '1px 6px',
          marginRight: 6,
        }}
      >
        #{n}
      </span>
    );
  };

  async function doReconcile() {
    if (
      !summary.reconciled &&
      !window.confirm(
        `There are still ${summary.unmatchedBank} bank and ${summary.unmatchedBook} book item(s) unmatched. ` +
          `Mark this reconciliation as reconciled anyway?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await completeReconciliation(id, recon.version);
      setView(await getMatchView(id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (
      !window.confirm(
        `Delete this reconciliation?\n\n` +
          `Every book entry it cleared will be UNMATCHED and returned to the uncleared list. ` +
          `Imported bank lines are removed. Posted journal entries you added via “Add to books” stay in the GL.\n\n` +
          `This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const res = await deleteReconciliation(id);
      window.alert(
        res.unmatchedBookLines > 0
          ? `Reconciliation deleted. ${res.unmatchedBookLines} book entr${res.unmatchedBookLines === 1 ? 'y was' : 'ies were'} unmatched.`
          : 'Reconciliation deleted.',
      );
      navigate('/accounting/reconciliations');
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const handleCsvFile = (file: File) => {
    setImportErr('');
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, error: perr } = parseBankCsv(String(reader.result ?? ''));
      if (perr) {
        setImportErr(perr);
        setCsvRows([]);
        return;
      }
      setCsvRows(rows);
      setCsvName(file.name);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvRows.length) return;
    setImporting(true);
    setImportErr('');
    try {
      const next = await importBankStatement(id, {
        expectedVersion: recon.version,
        lines: csvRows.map((r) => ({
          transactionDate: r.date,
          description: r.description,
          amount: r.amount,
          ...(r.reference ? { referenceNumber: r.reference } : {}),
        })),
      });
      setView(next);
      setShowImport(false);
      setCsvRows([]);
      setCsvName('');
    } catch (e: any) {
      setImportErr(e.message);
    } finally {
      setImporting(false);
    }
  };

  const openEntry = (line: MatchView['bank'][number]) => {
    setEntryLine(line);
    setEntryAccount('');
    setEntryDesc(line.description);
    setEntryErr('');
  };

  const submitEntry = async () => {
    if (!entryLine || !entryAccount) return;
    setSavingEntry(true);
    setEntryErr('');
    try {
      const next = await createEntryFromBankLine(id, {
        statementLineId: entryLine.id,
        accountId: entryAccount,
        ...(entryDesc.trim() ? { description: entryDesc.trim() } : {}),
      });
      setView(next);
      setEntryLine(null);
    } catch (e: any) {
      setEntryErr(e.message);
    } finally {
      setSavingEntry(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploadErr('');
    setUploading(true);
    try {
      await uploadReconAttachment(id, file);
      loadAttachments();
    } catch (e: any) {
      setUploadErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Link
        to="/accounting/reconciliations"
        className="acct-btn acct-btn--sm"
        style={{ marginBottom: 12, display: 'inline-block' }}
      >
        &larr; All Reconciliations
      </Link>

      <h1 style={{ marginBottom: 4 }}>
        {recon.periodName} — {recon.bankAccount.label}
      </h1>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <span className={`acct-badge acct-badge--${recon.status}`}>
          {recon.status.replace(/_/g, ' ')}
        </span>
        {editable && (
          <button
            className="acct-btn acct-btn--sm"
            onClick={() => {
              setShowImport(true);
              setImportErr('');
              setCsvRows([]);
              setCsvName('');
            }}
          >
            ⭱ Import Bank CSV
          </button>
        )}
        {editable && (
          <button
            className="acct-btn acct-btn--primary acct-btn--sm"
            disabled={busy}
            onClick={doReconcile}
            title="Finalize this reconciliation"
          >
            ✓ Reconcile
          </button>
        )}
        <button
          className="acct-btn acct-btn--sm"
          disabled={busy}
          onClick={doDelete}
          style={{ color: '#b42318', marginLeft: 'auto' }}
          title="Delete / undo this reconciliation and unmatch its entries"
        >
          🗑 Delete / Undo
        </button>
      </div>

      {error && (
        <div className="acct-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Summary counters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div
          className="acct-form"
          style={{ flex: 1, minWidth: 150, textAlign: 'center', padding: 14 }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: summary.unmatchedBank ? '#b42318' : '#067647',
            }}
          >
            {summary.unmatchedBank}
          </div>
          <div style={{ fontSize: 12, color: '#667085' }}>Bank — unmatched</div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginTop: 4,
              color: summary.unmatchedBankAmount ? '#b42318' : '#067647',
            }}
          >
            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
              summary.unmatchedBankAmount,
            )}
          </div>
        </div>
        <div
          className="acct-form"
          style={{ flex: 1, minWidth: 150, textAlign: 'center', padding: 14 }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: summary.unmatchedBook ? '#b42318' : '#067647',
            }}
          >
            {summary.unmatchedBook}
          </div>
          <div style={{ fontSize: 12, color: '#667085' }}>Books — unmatched</div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginTop: 4,
              color: summary.unmatchedBookAmount ? '#b42318' : '#067647',
            }}
          >
            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
              summary.unmatchedBookAmount,
            )}
          </div>
        </div>
        <div
          className="acct-form"
          style={{ flex: 1, minWidth: 150, textAlign: 'center', padding: 14 }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: '#175cd3' }}>{summary.matched}</div>
          <div style={{ fontSize: 12, color: '#667085' }}>Matched</div>
        </div>
      </div>

      {!editable && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #abefc6',
            color: '#067647',
            borderRadius: 8,
            padding: '10px 14px',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ✓ This reconciliation is finalized ({recon.status.replace(/_/g, ' ')}).
        </div>
      )}
      {editable && summary.reconciled && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #abefc6',
            color: '#067647',
            borderRadius: 8,
            padding: '10px 14px',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ✓ Everything is matched — click <strong>Reconcile</strong> to finalize.
        </div>
      )}

      {/* Tabs: Unreconciled | Reconciled */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eaecf0', marginBottom: 12 }}>
        {(['unreconciled', 'reconciled'] as const).map((t) => {
          const active = tab === t;
          const count =
            t === 'unreconciled' ? bankUnmatched.length + bookUnmatched.length : groupOrder.length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--mswd-navy)' : '#667085',
                borderBottom: active ? '2px solid var(--mswd-navy)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t === 'unreconciled' ? 'Unreconciled' : 'Reconciled'} ({count})
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      {tab === 'unreconciled' && editable && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            className="acct-btn acct-btn--sm"
            disabled={busy || bankUnmatched.length === 0}
            onClick={() => run(() => autoMatchBankLines(id))}
          >
            ⚡ Auto-match
          </button>
          <button
            className="acct-btn acct-btn--primary acct-btn--sm"
            disabled={!canMatch || busy}
            onClick={doMatch}
          >
            Match
          </button>
          {selBank.size > 0 || selBook.size > 0 ? (
            <span style={{ fontSize: 12.5, color: '#667085' }}>
              Bank <strong>{formatPeso(selBankTotal)}</strong> ({selBank.size}) · Books{' '}
              <strong>{formatPeso(selBookTotal)}</strong> ({selBook.size}) ·{' '}
              {canMatch ? (
                <span style={{ color: '#067647', fontWeight: 600 }}>
                  Difference ₱0.00 — balanced ✓
                </span>
              ) : (
                <span style={{ color: '#b42318', fontWeight: 600 }}>
                  Difference {formatPeso(Math.abs(matchDiff))}
                </span>
              )}
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: '#667085' }}>
              Tick amounts on each side (bank ↔ book, any number per side) until the difference is
              zero, then click Match. Auto-match pairs equal amounts for you.
            </span>
          )}
        </div>
      )}
      {tab === 'reconciled' && (
        <div style={{ fontSize: 12.5, color: '#667085', marginBottom: 10 }}>
          Matched sets — each bank line and the book entries it clears share a coloured tag. Click
          <strong> Unmatch</strong> to send a whole set back to Unreconciled.
        </div>
      )}

      {/* Two-column match board — independent search + scroll per side */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}
      >
        {/* Bank column */}
        <div
          className="acct-form"
          style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <div
            style={{
              padding: '8px 10px',
              background: '#f9fafb',
              borderBottom: '1px solid #eaecf0',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ whiteSpace: 'nowrap' }}>Bank Transactions ({bankRows.length})</strong>
            <SearchBox
              value={bankSearch}
              onChange={setBankSearch}
              placeholder="Search amount or keyword…"
            />
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {bankRows.length === 0 && (
              <div className="acct-empty" style={{ padding: 16 }}>
                {bankSearch
                  ? 'No bank lines match your search.'
                  : tab === 'unreconciled'
                    ? 'Nothing to match. Import a bank CSV to begin.'
                    : 'No matched bank lines yet.'}
              </div>
            )}
            {bankRows.map((b) => (
              <div
                key={b.id}
                onClick={() => editable && tab === 'unreconciled' && toggleBank(b.id)}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid #eaecf0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 13,
                  cursor: editable && tab === 'unreconciled' ? 'pointer' : 'default',
                  background: selBank.has(b.id) ? '#eff8ff' : 'transparent',
                }}
              >
                <span>
                  {tab === 'reconciled' && groupChip(b.matchGroupId)}
                  <span style={{ color: '#667085' }}>{fmtDate(b.transactionDate)}</span>{' '}
                  {b.description}
                  {b.referenceNumber && (
                    <span style={{ color: '#667085' }}> ({b.referenceNumber})</span>
                  )}
                  {editable && tab === 'unreconciled' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEntry(b);
                      }}
                      style={{
                        marginLeft: 8,
                        background: 'none',
                        border: 'none',
                        color: 'var(--mswd-navy)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        font: 'inherit',
                        padding: 0,
                      }}
                    >
                      Add to books
                    </button>
                  )}
                </span>
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
                >
                  <span
                    className="acct-text-mono"
                    style={{ color: b.amount < 0 ? '#b42318' : '#067647' }}
                  >
                    {formatPeso(b.amount)}
                  </span>
                  {tab === 'unreconciled' ? (
                    <input
                      type="checkbox"
                      readOnly
                      checked={selBank.has(b.id)}
                      style={{ pointerEvents: 'none', width: 16, height: 16 }}
                    />
                  ) : (
                    editable && (
                      <button
                        type="button"
                        onClick={() => run(() => unmatchGroup(id, b.matchGroupId!))}
                        disabled={busy}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#b42318',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          font: 'inherit',
                          padding: 0,
                        }}
                      >
                        Unmatch
                      </button>
                    )
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Book column */}
        <div
          className="acct-form"
          style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <div
            style={{
              padding: '8px 10px',
              background: '#f9fafb',
              borderBottom: '1px solid #eaecf0',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ whiteSpace: 'nowrap' }}>
              Book Entries — GL cash ({bookRows.length})
            </strong>
            <SearchBox
              value={bookSearch}
              onChange={setBookSearch}
              placeholder="Search amount or keyword…"
            />
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {bookRows.length === 0 && (
              <div className="acct-empty" style={{ padding: 16 }}>
                {bookSearch
                  ? 'No book entries match your search.'
                  : tab === 'unreconciled'
                    ? 'No uncleared book entries.'
                    : 'No matched book entries yet.'}
              </div>
            )}
            {bookRows.map((bk) => (
              <div
                key={bk.jevLineId}
                onClick={() => editable && tab === 'unreconciled' && toggleBook(bk.jevLineId)}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid #eaecf0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 13,
                  cursor: editable && tab === 'unreconciled' ? 'pointer' : 'default',
                  background: selBook.has(bk.jevLineId) ? '#eff8ff' : 'transparent',
                }}
              >
                <span>
                  {tab === 'reconciled' && groupChip(bk.matchGroupId)}
                  <span className="acct-text-mono" style={{ color: '#667085' }}>
                    {bk.jevNumber}
                  </span>{' '}
                  <span style={{ color: '#667085' }}>{fmtDate(bk.jevDate)}</span> {bk.description}
                </span>
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
                >
                  <span
                    className="acct-text-mono"
                    style={{ color: bk.amount < 0 ? '#b42318' : '#067647' }}
                  >
                    {formatPeso(bk.amount)}
                  </span>
                  {tab === 'unreconciled' ? (
                    <input
                      type="checkbox"
                      readOnly
                      checked={selBook.has(bk.jevLineId)}
                      style={{ pointerEvents: 'none', width: 16, height: 16 }}
                    />
                  ) : (
                    editable && (
                      <button
                        type="button"
                        onClick={() => run(() => unmatchGroup(id, bk.matchGroupId!))}
                        disabled={busy}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#b42318',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          font: 'inherit',
                          padding: 0,
                        }}
                      >
                        Unmatch
                      </button>
                    )
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Attachments */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ margin: '0 0 8px', color: 'var(--mswd-navy)' }}>Bank Statement Attachments</h3>
        {uploadErr && (
          <div className="acct-error" style={{ marginBottom: 8 }}>
            {uploadErr}
          </div>
        )}
        <label
          className="acct-btn acct-btn--sm"
          style={{ cursor: 'pointer', display: 'inline-block', marginBottom: 10 }}
        >
          {uploading ? 'Uploading…' : '⭱ Attach PDF / PNG'}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </label>
        {attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#667085' }}>No statement files attached yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="acct-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th className="acct-text-right">Size</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.fileName}</td>
                    <td className="acct-text-right acct-text-mono">
                      {formatBytes(a.fileSizeBytes)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {new Date(a.createdAt).toLocaleDateString('en-PH')}
                      {a.uploader ? ` · ${a.uploader.username}` : ''}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => downloadReconAttachment(id, a.id, a.fileName)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          font: 'inherit',
                          textDecoration: 'underline',
                          color: 'var(--mswd-navy)',
                        }}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CSV import modal */}
      {showImport && (
        <div
          onClick={() => setShowImport(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: 660,
              maxWidth: '95vw',
              maxHeight: '88vh',
              overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(16,24,40,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>Import Bank Transactions (CSV)</h2>
            <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 14px' }}>
              Upload the bank statement CSV. Date / Description / Amount (or Debit/Credit) /
              Reference columns are detected automatically. Imported rows appear on the Bank side to
              match.
            </p>
            {importErr && (
              <div className="acct-error" style={{ marginBottom: 12 }}>
                {importErr}
              </div>
            )}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvFile(f);
              }}
              style={{ marginBottom: 14 }}
            />
            {csvRows.length > 0 && (
              <>
                <div style={{ fontSize: 12.5, color: '#344054', marginBottom: 6 }}>
                  <strong>{csvName}</strong> — {csvRows.length} transaction
                  {csvRows.length === 1 ? '' : 's'}
                </div>
                <div
                  style={{
                    overflow: 'auto',
                    maxHeight: 300,
                    border: '1px solid #eaecf0',
                    borderRadius: 6,
                  }}
                >
                  <table className="acct-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Ref</th>
                        <th className="acct-text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                          <td>{r.description}</td>
                          <td>{r.reference ?? '—'}</td>
                          <td
                            className="acct-text-right acct-text-mono"
                            style={{ color: r.amount < 0 ? '#b42318' : '#067647' }}
                          >
                            {formatPeso(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="acct-btn"
                onClick={() => setShowImport(false)}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                onClick={handleImport}
                disabled={importing || csvRows.length === 0}
              >
                {importing ? 'Importing…' : `Import ${csvRows.length || ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create-entry-from-line modal */}
      {entryLine && (
        <div
          onClick={() => setEntryLine(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 24,
              width: 520,
              maxWidth: '95vw',
              boxShadow: '0 10px 40px rgba(16,24,40,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>Record to Books</h2>
            <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 14px' }}>
              {fmtDate(entryLine.transactionDate)} · {entryLine.description} ·{' '}
              <span style={{ color: entryLine.amount < 0 ? '#b42318' : '#067647' }}>
                {formatPeso(entryLine.amount)}
              </span>
              <br />
              Posts {entryLine.amount < 0 ? 'Dr account / Cr cash' : 'Dr cash / Cr account'} and
              matches this line.
            </p>
            {entryErr && (
              <div className="acct-error" style={{ marginBottom: 12 }}>
                {entryErr}
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
              {entryLine.amount < 0 ? 'Expense account' : 'Income account'} *
            </label>
            <div style={{ marginBottom: 12 }}>
              <AccountCombobox
                accounts={accounts}
                value={entryAccount}
                onChange={setEntryAccount}
                placeholder="Type account code or name…"
              />
            </div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                marginBottom: 4,
              }}
            >
              Description
            </label>
            <input
              value={entryDesc}
              onChange={(e) => setEntryDesc(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="acct-btn"
                onClick={() => setEntryLine(null)}
                disabled={savingEntry}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                onClick={submitEntry}
                disabled={savingEntry || !entryAccount}
              >
                {savingEntry ? 'Posting…' : 'Post & Match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Router entry ──

export default function BankReconciliationPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="acct-page">
      <AccountingSubNav />
      {id ? <ReconciliationDetail id={id} /> : <ReconciliationList />}
    </div>
  );
}
