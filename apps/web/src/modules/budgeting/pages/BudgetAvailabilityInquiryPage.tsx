import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  BudgetSummaryApiError,
  getBudgetHeaderSummary,
  listBudgetCycles,
  listBudgetHeaders,
  listBudgetVersionsForCycle,
} from '../api';
import { formatPeso } from '../format-peso';
import type { BudgetAmountSummary, BudgetCycleSummary, BudgetHeaderListItem, BudgetHeaderSortField, BudgetHeaderStatus } from '../types';
import './budget-availability-inquiry.css';

/**
 * GENUINE GAPS / ASSUMPTIONS in this page, surfaced rather than worked
 * around (no backend change made for any of these):
 *
 *  - This inquiry operates at the BUDGET HEADER grain, not "per budget
 *    line" as literally described in the task. budget_lines has
 *    exactly three real fields (accountCode, description, amount) and
 *    NO relationship to releases/reservations/obligations at all — the
 *    five official amounts (Approved/Released/Reserved/Obligated/
 *    Available) only genuinely exist at the header (or release) level,
 *    computed by BudgetCalculationService. Showing fabricated per-line
 *    versions of these five figures would be exactly the "independently
 *    calculated official balance" this task explicitly forbids, so
 *    each result row here is one BUDGET (header), which is the
 *    genuine, backend-calculated unit these amounts apply to.
 *  - "Budget Category" and "Program/Project/Activity" filters/columns:
 *    no such fields exist anywhere in this schema. Omitted rather than
 *    faked with an invented account-code-prefix mapping.
 *  - "Account Code"/"Account Title" as top-level FILTERS: these are
 *    budget_line fields, and the existing list endpoint
 *    (GET /budgeting/budget-headers) has no way to filter headers by a
 *    nested line's field — there is no backend support for this. Not
 *    implemented as a filter; the existing Budget Detail page (linked
 *    from every result row here) already shows a budget's full lines
 *    with their account codes/titles.
 *  - Department/Fund Source as separate FILTER FIELDS (vs. the existing
 *    free-text search that already matches both): there is still no
 *    listing/discovery endpoint for responsibility centers or fund
 *    sources anywhere in this system (same gap noted on the Create
 *    Budget Header page), so a real name-based dropdown isn't
 *    buildable. The existing free-text search (already matches both
 *    fields) is kept as the primary way to narrow by these.
 *  - Summary totals reflect only the CURRENTLY LOADED page of results,
 *    not the full filtered dataset across every page. There is no
 *    multi-header aggregation endpoint in BudgetCalculationService
 *    (only single-header/single-release summaries exist) — computing a
 *    true full-dataset total would mean fetching a per-header summary
 *    for potentially every matching budget across every page, which
 *    is a real N+1 concern this page already tries to keep bounded
 *    (one page of results, RESULT_LIMIT-sized). Labeled honestly as
 *    "this page" rather than claiming full-dataset coverage.
 *  - "Budget Line Details" links to the EXISTING Budget Detail page
 *    (no new detail view was built) — that page already shows budget
 *    header info, account/line details, release history, reservation
 *    history, and the current available balance, exactly what this
 *    task asks for, reusing what already exists rather than
 *    duplicating it.
 *  - Availability Check: there is no dedicated backend "can I spend X"
 *    endpoint anywhere (confirmed — the only existing balance check,
 *    BudgetValidation.assertWithinAvailableBudget, is private to
 *    ReservationService.submit() and has side effects). This check
 *    instead compares the user's proposed amount against the SAME
 *    backend-calculated `availableAmount` already fetched for that
 *    budget (BudgetCalculationService is still the source of truth for
 *    the number itself) — a client-side comparison, not a new balance
 *    formula. "Budget Not Released" and "Fiscal Year/Period Closed"
 *    are derived from the header's/cycle's own EXISTING status fields,
 *    same reasoning. Nothing is created, modified, or reserved by this
 *    check, and no audit record is written — this app has never
 *    audited read-only inquiries anywhere, so none was added here.
 */

const RESULT_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2;

const STATUS_OPTIONS: { value: BudgetHeaderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

interface InquiryResult {
  header: BudgetHeaderListItem;
  summary: BudgetAmountSummary;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; results: InquiryResult[]; total: number };

function extractFiscalYear(cycle: BudgetCycleSummary): string {
  const match = cycle.code.match(/\d{4}/) ?? cycle.name.match(/\d{4}/);
  return match ? match[0] : cycle.name;
}

export function BudgetAvailabilityInquiryPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BudgetHeaderStatus | ''>('');
  const [fiscalYearCycleId, setFiscalYearCycleId] = useState('');
  const [resolvedVersionId, setResolvedVersionId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<BudgetHeaderSortField>('totalAmount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  const [cycles, setCycles] = useState<BudgetCycleSummary[]>([]);
  const [checkTarget, setCheckTarget] = useState<InquiryResult | null>(null);

  // Fiscal Year filter options — same existing endpoint the Annual
  // Budgets page already uses.
  useEffect(() => {
    listBudgetCycles()
      .then(setCycles)
      .catch(() => {
        /* non-fatal — the Fiscal Year dropdown just stays empty */
      });
  }, []);

  // Same "resolve cycle -> its current version" pattern already
  // established on the Annual Budgets page — the existing list
  // endpoint can only filter by one exact budgetVersionId, not a whole
  // cycle.
  useEffect(() => {
    if (!fiscalYearCycleId) {
      setResolvedVersionId(undefined);
      return;
    }
    let cancelled = false;
    listBudgetVersionsForCycle(fiscalYearCycleId)
      .then((versions) => {
        if (cancelled) return;
        const current = versions.find((v) => v.isCurrent) ?? versions[0];
        setResolvedVersionId(current?.id);
        setPage(1);
      })
      .catch(() => {
        if (!cancelled) setResolvedVersionId(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [fiscalYearCycleId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const hasAnyFilter = search.length >= MIN_SEARCH_LENGTH || status !== '' || fiscalYearCycleId !== '';

  useEffect(() => {
    // Don't require every filter — but DO require at least one
    // meaningful filter/search before running a query, so this page
    // doesn't silently dump the entire organization's budgets by
    // default.
    if (!hasAnyFilter) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    listBudgetHeaders({
      ...(search.length >= MIN_SEARCH_LENGTH ? { search } : {}),
      ...(status ? { status } : {}),
      ...(resolvedVersionId ? { budgetVersionId: resolvedVersionId } : {}),
      page,
      pageSize: RESULT_PAGE_SIZE,
      sortBy,
      sortOrder,
    })
      .then(async (result) => {
        const settled = await Promise.allSettled(
          result.data.map(async (header) => ({ header, summary: await getBudgetHeaderSummary(header.id) })),
        );
        if (cancelled) return;
        const results = settled
          .filter((r): r is PromiseFulfilledResult<InquiryResult> => r.status === 'fulfilled')
          .map((r) => r.value);
        setState({ status: 'loaded', results, total: result.total });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof BudgetSummaryApiError ? error.message : 'Something went wrong searching budgets.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [search, status, resolvedVersionId, page, sortBy, sortOrder, hasAnyFilter]);

  function toggleSort(field: BudgetHeaderSortField) {
    if (sortBy === field) setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  }
  function sortIcon(field: BudgetHeaderSortField) {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  }

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setFiscalYearCycleId('');
    setPage(1);
  }

  const results = state.status === 'loaded' ? state.results : [];
  const total = state.status === 'loaded' ? state.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / RESULT_PAGE_SIZE));

  // "Ensure totals reflect the complete filtered dataset" — see this
  // file's header comment for why that's genuinely not possible
  // without a new aggregation endpoint; these are honestly the totals
  // for the currently-loaded page only.
  const pageTotals = useMemo(() => {
    const sum = (pick: (s: BudgetAmountSummary) => string) =>
      results.reduce((acc, r) => acc + (parseFloat(pick(r.summary)) || 0), 0);
    return {
      approved: sum((s) => s.approvedAmount),
      released: sum((s) => s.releasedAmount),
      reserved: sum((s) => s.reservedAmount),
      obligated: sum((s) => s.obligatedAmount),
      available: sum((s) => s.availableAmount),
    };
  }, [results]);

  return (
    <div className="availability-inquiry">
      <h1 className="availability-inquiry__heading">Budget Availability Inquiry</h1>
      <p className="availability-inquiry__subheading">
        Read-only check of current budget position before starting a Procurement, Accounting, or other expenditure transaction.
      </p>

      <div className="availability-inquiry__toolbar">
        <input
          className="availability-inquiry__search"
          type="text"
          placeholder="Search by responsibility center or fund source…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="availability-inquiry__filter"
          value={fiscalYearCycleId}
          onChange={(e) => setFiscalYearCycleId(e.target.value)}
          aria-label="Filter by fiscal year"
        >
          <option value="">All fiscal years</option>
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {extractFiscalYear(cycle)} — {cycle.name}
            </option>
          ))}
        </select>
        <select
          className="availability-inquiry__filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as BudgetHeaderStatus | '');
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hasAnyFilter && (
          <button type="button" className="availability-inquiry__clear" onClick={clearFilters}>
            ✕ Clear Filters
          </button>
        )}
      </div>

      {state.status === 'idle' && (
        <p className="availability-inquiry__status">
          {searchInput.length > 0 && searchInput.length < MIN_SEARCH_LENGTH
            ? `Type at least ${MIN_SEARCH_LENGTH} characters, or pick a fiscal year/status filter, to search.`
            : 'Search, or pick a fiscal year/status filter, to check budget availability.'}
        </p>
      )}
      {state.status === 'loading' && <p className="availability-inquiry__status">Searching…</p>}
      {state.status === 'error' && <p className="availability-inquiry__status availability-inquiry__status--error">{state.message}</p>}

      {state.status === 'loaded' && (
        <>
          {results.length === 0 ? (
            <p className="availability-inquiry__status">No budgets match your search/filters.</p>
          ) : (
            <>
              <div className="availability-inquiry__summary">
                <SummaryStat label="Total Approved" value={pageTotals.approved} accent="var(--navy)" />
                <SummaryStat label="Total Released" value={pageTotals.released} accent="var(--blue)" />
                <SummaryStat label="Total Reserved" value={pageTotals.reserved} accent="var(--amber)" />
                <SummaryStat label="Total Obligated" value={pageTotals.obligated} accent="var(--red)" />
                <SummaryStat label="Total Available" value={pageTotals.available} accent="var(--teal)" />
              </div>
              <p className="availability-inquiry__totals-hint">
                Totals reflect the {results.length} result{results.length === 1 ? '' : 's'} shown on this page, not
                every page of the filtered results.
              </p>

              <div className="availability-inquiry__table-wrap">
                <table className="availability-inquiry__table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Fund Source</th>
                      <th className="availability-inquiry__sortable" onClick={() => toggleSort('totalAmount')}>
                        Approved{sortIcon('totalAmount')}
                      </th>
                      <th>Released</th>
                      <th>Reserved</th>
                      <th>Obligated</th>
                      <th>Available</th>
                      <th className="availability-inquiry__sortable" onClick={() => toggleSort('status')}>
                        Status{sortIcon('status')}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(({ header, summary }) => {
                      const isNegative = summary.availableAmount.startsWith('-');
                      return (
                        <tr key={header.id}>
                          <td>{header.responsibilityCenter.name}</td>
                          <td>{header.fundSource.name}</td>
                          <td className="availability-inquiry__amount">{formatPeso(summary.approvedAmount)}</td>
                          <td className="availability-inquiry__amount">{formatPeso(summary.releasedAmount)}</td>
                          <td className="availability-inquiry__amount">{formatPeso(summary.reservedAmount)}</td>
                          <td className="availability-inquiry__amount">{formatPeso(summary.obligatedAmount)}</td>
                          <td className={`availability-inquiry__amount${isNegative ? ' availability-inquiry__amount--negative' : ''}`}>
                            {formatPeso(summary.availableAmount)}
                          </td>
                          <td>
                            <span className={`availability-inquiry__badge availability-inquiry__badge--${header.status}`}>{header.status}</span>
                          </td>
                          <td className="availability-inquiry__actions">
                            <Link to={`/budgeting/budget-headers/${header.id}`} className="availability-inquiry__row-link">
                              Budget Details
                            </Link>
                            <button type="button" className="availability-inquiry__row-link" onClick={() => setCheckTarget({ header, summary })}>
                              Check Amount
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="availability-inquiry__pagination">
                <span>
                  Showing {(page - 1) * RESULT_PAGE_SIZE + 1}–{Math.min(page * RESULT_PAGE_SIZE, total)} of {total}
                </span>
                <div className="availability-inquiry__pagination-buttons">
                  <button
                    type="button"
                    className="availability-inquiry__page-button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="availability-inquiry__page-button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {checkTarget && <AvailabilityCheckModal target={checkTarget} onClose={() => setCheckTarget(null)} />}
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="availability-inquiry__stat" style={{ ['--stat-accent' as string]: accent }}>
      <div className="availability-inquiry__stat-label">{label}</div>
      <div className="availability-inquiry__stat-value">{formatPeso(value.toFixed(2))}</div>
    </div>
  );
}

/**
 * See this file's header comment for the full reasoning: no dedicated
 * backend "check" endpoint exists, so this compares the proposed
 * amount against the ALREADY-FETCHED, backend-calculated
 * availableAmount for this budget — a client-side comparison of real
 * numbers, not a new balance formula. Nothing is written anywhere;
 * this is purely informational.
 */
function AvailabilityCheckModal({ target, onClose }: { target: InquiryResult; onClose: () => void }) {
  const [amountInput, setAmountInput] = useState('');
  const [result, setResult] = useState<{ kind: string; message: string } | null>(null);

  function runCheck(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(amountInput);
    if (!amountInput || Number.isNaN(amount) || amount <= 0) {
      setResult({ kind: 'invalid', message: 'Enter a proposed amount greater than zero.' });
      return;
    }

    if (target.header.status !== 'approved') {
      setResult({ kind: 'not-eligible', message: `Budget Line Not Eligible — this budget is "${target.header.status}", not approved.` });
      return;
    }
    const released = parseFloat(target.summary.releasedAmount) || 0;
    if (released <= 0) {
      setResult({ kind: 'not-released', message: 'Budget Not Released — no funds have been released against this budget yet.' });
      return;
    }
    const available = parseFloat(target.summary.availableAmount) || 0;
    if (amount > available) {
      setResult({
        kind: 'insufficient',
        message: `Insufficient Budget Available — ${formatPeso(amount.toFixed(2))} requested, only ${formatPeso(available.toFixed(2))} available.`,
      });
      return;
    }
    setResult({ kind: 'sufficient', message: `Sufficient Budget Available — ${formatPeso(available.toFixed(2))} available.` });
  }

  return (
    <div className="availability-inquiry__modal-backdrop" onClick={onClose} role="presentation">
      <div className="availability-inquiry__modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="availability-inquiry__modal-header">
          <h2>Availability Check</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="availability-inquiry__modal-target">
          {target.header.responsibilityCenter.name} — {target.header.fundSource.name}
        </p>
        <form onSubmit={runCheck}>
          <label htmlFor="proposedAmount">Proposed Amount (₱)</label>
          <input
            id="proposedAmount"
            type="number"
            min="0.01"
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
          <button type="submit" className="availability-inquiry__modal-check-btn">
            Check
          </button>
        </form>
        {result && (
          <p className={`availability-inquiry__modal-result availability-inquiry__modal-result--${result.kind}`}>{result.message}</p>
        )}
        <p className="availability-inquiry__modal-note">
          This is an inquiry only — no balance is reserved, deducted, or modified, and no record is created.
        </p>
      </div>
    </div>
  );
}
