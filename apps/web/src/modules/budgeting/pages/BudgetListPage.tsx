import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  BudgetSummaryApiError,
  getBudgetCycle,
  getBudgetVersion,
  listBudgetCycles,
  listBudgetHeaders,
  listBudgetVersionsForCycle,
} from '../api';
import { formatPeso } from '../format-peso';
import type {
  BudgetCycleSummary,
  BudgetHeaderListItem,
  BudgetHeaderSortField,
  BudgetHeaderStatus,
  BudgetVersionSummary,
} from '../types';
import './budget-dashboard.css'; // shares the same status-badge classes as the Dashboard, per design
import './budget-list.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: BudgetHeaderListItem[]; total: number };

/** version.id -> its cycle, for rendering Fiscal Year / Budget Cycle /
 * Version per row. Populated by a second effect after the header page
 * loads, deduped so a page of (say) 20 headers sharing 2 distinct
 * versions only costs 2 version fetches + 2 cycle fetches, not 20+20 —
 * both endpoints already existed before this page used them (the
 * Dashboard added their first frontend callers). */
interface VersionContext {
  version: BudgetVersionSummary;
  cycle: BudgetCycleSummary;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: BudgetHeaderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/** Only totalAmount/createdAt map to columns this page can genuinely
 * sort server-side. Fiscal Year and Version are deliberately NOT
 * sortable here: the existing list endpoint can only order by a scalar
 * column on budget_headers itself, and fiscal year / version live on
 * related tables reached through a join, which this endpoint doesn't
 * support ordering by. Sorting either client-side only would silently
 * reorder just the current page instead of the whole result set —
 * worse than not offering it, so it's left out rather than faked. */

/** Extracts a 4-digit year from a cycle's code/name for the Fiscal Year
 * column (e.g. "FY2026 Budget Cycle" -> "2026"). There is no endpoint
 * anywhere in the current system that exposes the raw fiscal_years
 * row's year number directly — the cycle's name/code is the only place
 * this system surfaces it today. Falls back to the full cycle name if
 * no 4-digit year pattern is found, so nothing renders blank. */
function extractFiscalYear(cycle: BudgetCycleSummary): string {
  const match = cycle.code.match(/\d{4}/) ?? cycle.name.match(/\d{4}/);
  return match ? match[0] : cycle.name;
}

export function BudgetListPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BudgetHeaderStatus | ''>('');
  const [fiscalYearCycleId, setFiscalYearCycleId] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<BudgetHeaderSortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const [cycles, setCycles] = useState<BudgetCycleSummary[]>([]);
  // Resolves the selected cycle to the specific budget_version_id the
  // (already-existing) budgetVersionId filter param actually needs —
  // see the effect below for why "current version of the selected
  // cycle" is the correct choice here.
  const [resolvedVersionId, setResolvedVersionId] = useState<string | undefined>(undefined);
  const [versionContexts, setVersionContexts] = useState<Record<string, VersionContext>>({});

  // Fiscal Year filter options — fetched once. The existing
  // GET /budgeting/budget-cycles endpoint returns every cycle for the
  // organization unpaginated (cycles are few; the backend itself treats
  // this as a small, complete list).
  useEffect(() => {
    let cancelled = false;
    listBudgetCycles()
      .then((result) => {
        if (!cancelled) setCycles(result);
      })
      .catch(() => {
        // Non-fatal — the Fiscal Year dropdown just stays empty; the
        // rest of the page (search/status/pagination) still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The existing list endpoint can only filter by one exact
   * `budgetVersionId`, not by a whole cycle. This resolves the
   * selected cycle to its CURRENT version's id (the version flagged
   * `isCurrent`), which is the practically correct choice for a
   * "Fiscal Year" filter — it shows budgets under the active version
   * for that year, not superseded drafts. A cycle with no current
   * version yet (or none selected) clears the filter entirely.
   */
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

  // Debounce the search box so every keystroke doesn't fire a request.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    listBudgetHeaders({
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(resolvedVersionId ? { budgetVersionId: resolvedVersionId } : {}),
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortOrder,
    })
      .then((result) => {
        if (!cancelled) setState({ status: 'loaded', data: result.data, total: result.total });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof BudgetSummaryApiError
            ? error.message
            : 'Something went wrong loading budgets.';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [search, status, resolvedVersionId, page, sortBy, sortOrder]);

  // Enrich the current page with Fiscal Year / Budget Cycle / Version —
  // deduped per unique budgetVersionId actually present on this page.
  useEffect(() => {
    if (state.status !== 'loaded') return;
    const uniqueVersionIds = [...new Set(state.data.map((h) => h.budgetVersionId))].filter(
      (id) => !(id in versionContexts),
    );
    if (uniqueVersionIds.length === 0) return;

    let cancelled = false;
    Promise.all(
      uniqueVersionIds.map(async (versionId) => {
        const version = await getBudgetVersion(versionId);
        const cycle = await getBudgetCycle(version.budgetCycleId);
        return [versionId, { version, cycle }] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setVersionContexts((prev) => {
          const next = { ...prev };
          for (const [id, ctx] of entries) next[id] = ctx;
          return next;
        });
      })
      .catch(() => {
        // Non-fatal — affected rows just show "—" for these columns
        // instead of blocking the whole table.
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  function toggleSort(field: BudgetHeaderSortField) {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  }

  function sortIcon(field: BudgetHeaderSortField) {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? '▲' : '▼';
  }

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setFiscalYearCycleId('');
    setPage(1);
  }

  const hasActiveFilters = search !== '' || status !== '' || fiscalYearCycleId !== '';

  const total = state.status === 'loaded' ? state.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="budget-list">
      <div className="budget-list__header-row">
        <div>
          <h1 className="budget-list__heading">Annual Budgets</h1>
          <p className="budget-list__subheading">
            Search, filter, and browse every budget in this organization.
          </p>
        </div>
        {/* A Create Budget route now exists (header-only, per its own
            task scope) — this links there instead of staying disabled. */}
        <Link to="/budgeting/budget-headers/new" className="budget-list__new-button">
          + New Budget
        </Link>
      </div>

      <div className="budget-list__toolbar">
        <input
          className="budget-list__search"
          type="text"
          placeholder="Search by responsibility center or fund source…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="budget-list__status-filter"
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
          className="budget-list__status-filter"
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
        {hasActiveFilters && (
          <button type="button" className="budget-list__clear" onClick={clearFilters}>
            ✕ Clear
          </button>
        )}
      </div>

      {state.status === 'loading' && <p className="budget-list__status">Loading budgets…</p>}
      {state.status === 'error' && (
        <p className="budget-list__status budget-list__status--error">{state.message}</p>
      )}

      {state.status === 'loaded' && (
        <>
          <div className="budget-list__table-wrap">
            <table className="budget-list__table">
              <thead>
                <tr>
                  <th>Fiscal Year</th>
                  <th>Budget Cycle</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th title="Not available yet — no endpoint in the current system resolves a user id to a name.">
                    Prepared By
                  </th>
                  <th className="budget-list__sortable" onClick={() => toggleSort('createdAt')}>
                    Date Prepared
                    <span className="budget-list__sort-icon">{sortIcon('createdAt')}</span>
                  </th>
                  <th className="budget-list__sortable" onClick={() => toggleSort('totalAmount')}>
                    Total Approved Budget
                    <span className="budget-list__sort-icon">{sortIcon('totalAmount')}</span>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="budget-list__status">
                      No budgets match your search/filters.
                    </td>
                  </tr>
                )}
                {state.data.map((header) => {
                  const ctx = versionContexts[header.budgetVersionId];
                  return (
                    <tr key={header.id}>
                      <td>{ctx ? extractFiscalYear(ctx.cycle) : '…'}</td>
                      <td>{ctx ? ctx.cycle.name : '…'}</td>
                      <td>{ctx ? `${ctx.version.name} (v${ctx.version.versionNumber})` : '…'}</td>
                      <td>
                        <span
                          className={`budget-dashboard__badge budget-dashboard__badge--${header.status}`}
                        >
                          {header.status}
                        </span>
                      </td>
                      <td
                        className="budget-list__muted"
                        title="No user-lookup endpoint exists in the current system."
                      >
                        —
                      </td>
                      <td>{new Date(header.createdAt).toLocaleDateString()}</td>
                      <td className="budget-list__amount">{formatPeso(header.totalAmount)}</td>
                      <td className="budget-list__actions">
                        <Link
                          className="budget-list__row-link"
                          to={`/budgeting/dashboard/${header.id}`}
                        >
                          Open Budget
                        </Link>
                        <Link
                          className="budget-list__row-link"
                          to={`/budgeting/budget-headers/${header.id}`}
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="budget-list__pagination">
            <span>
              {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
            </span>
            <div className="budget-list__pagination-buttons">
              <button
                type="button"
                className="budget-list__page-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="budget-list__page-button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
