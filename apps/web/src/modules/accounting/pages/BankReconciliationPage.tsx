import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';
import {
  getReconciliations,
  createReconciliation,
  getChartOfAccounts,
  getGlCashBalance,
  getMatchView,
  importBankStatement,
  matchBankLine,
  autoMatchBankLines,
  unmatchBankLine,
  createEntryFromBankLine,
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
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selBank, setSelBank] = useState<string | null>(null); // statementLineId
  const [selBook, setSelBook] = useState<string | null>(null); // jevLineId
  const [showMatched, setShowMatched] = useState(false);

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
  const unmatchedBank = bank.filter((b) => !b.matched);
  const matchedBank = bank.filter((b) => b.matched);
  const selectedBankLine = unmatchedBank.find((b) => b.id === selBank) ?? null;

  async function run(fn: () => Promise<MatchView>) {
    setBusy(true);
    setError('');
    try {
      const next = await fn();
      setView(next);
      setSelBank(null);
      setSelBook(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const doMatch = () => {
    if (selBank && selBook)
      run(() => matchBankLine(id, { statementLineId: selBank, jevLineId: selBook }));
  };

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

  const rowSel: React.CSSProperties = {
    padding: '8px 10px',
    borderBottom: '1px solid #eaecf0',
    cursor: editable ? 'pointer' : 'default',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    fontSize: 13,
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

      {summary.reconciled && (
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
          ✓ Fully reconciled — every bank and book transaction is matched.
        </div>
      )}

      {editable && (
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
            disabled={busy || unmatchedBank.length === 0}
            onClick={() => run(() => autoMatchBankLines(id))}
          >
            ⚡ Auto-match
          </button>
          <button
            className="acct-btn acct-btn--primary acct-btn--sm"
            disabled={!selBank || !selBook || busy}
            onClick={doMatch}
          >
            Match selected
          </button>
          <span style={{ fontSize: 12.5, color: '#667085' }}>
            Auto-match clears every equal-amount pair; or pick one from each side and Match. For a
            bank-only line, use “Add to books”.
          </span>
        </div>
      )}

      {/* Two-column match board */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="acct-form" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '10px 12px',
              fontWeight: 700,
              background: '#f9fafb',
              borderBottom: '1px solid #eaecf0',
            }}
          >
            Bank Transactions ({unmatchedBank.length})
          </div>
          {unmatchedBank.length === 0 && (
            <div className="acct-empty" style={{ padding: 16 }}>
              Nothing to match. Import a bank CSV to begin.
            </div>
          )}
          {unmatchedBank.map((b) => (
            <div
              key={b.id}
              style={{
                ...rowSel,
                background: selBank === b.id ? '#eff8ff' : 'transparent',
              }}
              onClick={() => editable && setSelBank(selBank === b.id ? null : b.id)}
            >
              <span>
                <span style={{ color: '#667085' }}>{fmtDate(b.transactionDate)}</span>{' '}
                {b.description}
                {b.referenceNumber && (
                  <span style={{ color: '#667085' }}> ({b.referenceNumber})</span>
                )}
                {editable && (
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
                className="acct-text-mono"
                style={{ color: b.amount < 0 ? '#b42318' : '#067647', whiteSpace: 'nowrap' }}
              >
                {formatPeso(b.amount)}
              </span>
            </div>
          ))}
        </div>

        <div className="acct-form" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '10px 12px',
              fontWeight: 700,
              background: '#f9fafb',
              borderBottom: '1px solid #eaecf0',
            }}
          >
            Book Entries — GL cash ({book.length})
          </div>
          {book.length === 0 && (
            <div className="acct-empty" style={{ padding: 16 }}>
              No uncleared book entries.
            </div>
          )}
          {book.map((bk) => {
            const suggested =
              selectedBankLine && Math.abs(bk.amount - selectedBankLine.amount) < 0.01;
            return (
              <div
                key={bk.jevLineId}
                style={{
                  ...rowSel,
                  background:
                    selBook === bk.jevLineId ? '#eff8ff' : suggested ? '#f0fdf4' : 'transparent',
                }}
                onClick={() =>
                  editable && setSelBook(selBook === bk.jevLineId ? null : bk.jevLineId)
                }
              >
                <span>
                  <span className="acct-text-mono" style={{ color: '#667085' }}>
                    {bk.jevNumber}
                  </span>{' '}
                  <span style={{ color: '#667085' }}>{fmtDate(bk.jevDate)}</span> {bk.description}
                  {suggested && (
                    <span style={{ color: '#067647', fontSize: 11, marginLeft: 6 }}>● match</span>
                  )}
                </span>
                <span
                  className="acct-text-mono"
                  style={{ color: bk.amount < 0 ? '#b42318' : '#067647', whiteSpace: 'nowrap' }}
                >
                  {formatPeso(bk.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Matched pairs */}
      {matchedBank.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="acct-btn acct-btn--sm" onClick={() => setShowMatched(!showMatched)}>
            {showMatched ? '▾' : '▸'} Matched ({matchedBank.length})
          </button>
          {showMatched && (
            <div className="acct-form" style={{ padding: 0, overflow: 'hidden', marginTop: 8 }}>
              {matchedBank.map((b) => (
                <div key={b.id} style={{ ...rowSel, cursor: 'default' }}>
                  <span>
                    <span style={{ color: '#667085' }}>{fmtDate(b.transactionDate)}</span>{' '}
                    {b.description} →{' '}
                    <span className="acct-text-mono" style={{ color: '#067647' }}>
                      {b.matchedJevNumber}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="acct-text-mono">{formatPeso(b.amount)}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => run(() => unmatchBankLine(id, b.id))}
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
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
            <select
              value={entryAccount}
              onChange={(e) => setEntryAccount(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d0d5dd',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                marginBottom: 12,
              }}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountCode} — {a.name}
                </option>
              ))}
            </select>
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
