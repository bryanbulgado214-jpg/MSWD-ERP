import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  BudgetSummaryApiError,
  deleteBudgetLine,
  getBudgetCycle,
  getBudgetHeader,
  getBudgetHeaderSummary,
  getBudgetVersion,
  listBudgetLinesForHeader,
  updateBudgetHeaderStatus,
  listBudgetReleasesForHeader,
  listReservationsForHeader,
} from '../api';
import { checkBudgetValidation } from '../budget-validation-checks';
import { formatPeso } from '../format-peso';
import type {
  BudgetAmountSummary,
  BudgetCycleSummary,
  BudgetHeaderListItem,
  BudgetLineItem,
  BudgetReleaseItem,
  BudgetVersionSummary,
  ReservationListItem,
} from '../types';
import { BudgetLineEditorModal } from './BudgetLineEditorModal';
import { BudgetDecisionConfirmModal } from './BudgetDecisionConfirmModal';
import { ReturnForRevisionModal } from './ReturnForRevisionModal';
import './budget-detail.css';

/**
 * GENUINE GAPS in this page, identified rather than worked around (no
 * backend change made for any of these):
 *
 *  - "Remarks" (header) has no backing column on budget_headers at all
 *    (see schema.prisma) — omitted, same as the Create Budget page.
 *  - "Prepared By" (header) has no user-lookup endpoint anywhere in the
 *    system — shown as "—" with a tooltip, same pattern as the Annual
 *    Budgets page.
 *  - budget_lines has exactly four real fields: accountCode,
 *    description, amount, plus audit columns (see schema.prisma). It
 *    has NO per-line Responsibility Center, Fund Source, Budget
 *    Category, Program/Project/Activity, or per-line
 *    Released/Reserved/Obligated/Available — those concepts only exist
 *    at the budget_release / budget_header level in this schema, never
 *    decomposed per line item. The Budget Lines table below shows only
 *    the columns that are real: Account Code, Account Title (the
 *    `description` field), Approved Amount (the `amount` field), and
 *    Actions.
 *  - Add/Edit Budget Line open the BudgetLineEditorModal (built as
 *    this app's first modal — no prior modal pattern existed), which
 *    calls the already-existing POST/PATCH budget-line endpoints.
 *  - `listBudgetLinesForHeader` returns every line for a header
 *    unpaginated (there is no dedicated paginated endpoint for lines,
 *    unlike budget-headers) — search/sort/pagination on this table are
 *    therefore implemented over the already-fully-loaded list on the
 *    client, which is accurate here (unlike a partial-page scenario)
 *    since every line for this header really is already in memory.
 *  - Submit / Approve / Reject (HeaderActionsSection below) all call
 *    the SAME existing generic `PATCH /budgeting/budget-headers/:id`
 *    endpoint with a different `status` value — there are no dedicated
 *    submit/approve/reject endpoints for headers the way there are for
 *    reservations. Two real gaps this surfaces rather than papers over:
 *      1. The backend does not validate that a transition is legal
 *         (BudgetHeaderService.update accepts any status regardless of
 *         the current one) — the button visibility below is a UI-level
 *         courtesy based on current status, not an enforced rule.
 *      2. There is only one permission (`budgeting.header.manage`) for
 *         create/edit/submit/approve/reject combined — unlike
 *         reservations, which have four separate granular permissions.
 *         There is currently no way to require a different role to
 *         approve than the one who submitted.
 *  - Submit specifically now has a STRICTER gate than Approve/Reject:
 *    checkBudgetValidation (budget-validation-checks.ts, shared with
 *    BudgetReviewPage) must return zero warnings before the Submit
 *    button even appears — this is a genuine hard block, not a soft
 *    heads-up, since submitting is meant to be the "this budget is
 *    ready" checkpoint. The Budget Line Editor's own duplicate-code
 *    notice stays non-blocking for saving one line; only the whole-
 *    budget Submit action is strict.
 *  - "Submitted By" / "Submitted Date/Time": budget_headers has no
 *    dedicated columns for these (only generic createdBy/updatedBy/
 *    createdAt/updatedAt, which get overwritten by the NEXT status
 *    change, e.g. once approved). The existing Core audit trigger DOES
 *    permanently capture who changed the status to `submitted` and
 *    when (verified directly against the database: the audit_logs row
 *    for that update has `performed_by` = the acting user and a
 *    before/after `changed_fields` showing the status transition) —
 *    but there is no endpoint anywhere to read audit_logs from the
 *    frontend (same gap noted since the Dashboard's "recent audit
 *    activity"), so this can't be displayed here.
 *  - Notifications: no notification-creating service exists anywhere
 *    in this backend today (the `notifications` table exists in the
 *    Core Platform schema, but nothing writes to it for any event) —
 *    so there is nothing existing to trigger on submission, and none
 *    was added here, per instruction not to build a new one.
 */

interface DetailData {
  header: BudgetHeaderListItem;
  version: BudgetVersionSummary;
  cycle: BudgetCycleSummary;
  summary: BudgetAmountSummary;
  lines: BudgetLineItem[];
  releases: BudgetReleaseItem[];
  reservations: ReservationListItem[];
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; data: DetailData };

const LINES_PAGE_SIZE = 10;

export function BudgetDetailPage() {
  const { budgetHeaderId } = useParams<{ budgetHeaderId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  // Transient only — see ReturnForRevisionModal's comment on why this
  // can't be persisted (no remarks column on budget_headers). Lives
  // here (above the data refetch) so it survives onDataChanged's
  // reload within this same page visit, but is genuinely gone on the
  // next page load, same as it would be even if we tried harder to
  // keep it around client-side.
  const [lastReturnReason, setLastReturnReason] = useState<string | null>(null);

  useEffect(() => {
    if (!budgetHeaderId) {
      setState({ status: 'error', message: 'No budget selected.' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const header = await getBudgetHeader(budgetHeaderId);
        const [version, summary, lines, releases, reservations] = await Promise.all([
          getBudgetVersion(header.budgetVersionId),
          getBudgetHeaderSummary(budgetHeaderId),
          listBudgetLinesForHeader(budgetHeaderId),
          listBudgetReleasesForHeader(budgetHeaderId),
          listReservationsForHeader(budgetHeaderId),
        ]);
        const cycle = await getBudgetCycle(version.budgetCycleId);

        if (!cancelled) {
          setState({ status: 'loaded', data: { header, version, cycle, summary, lines, releases, reservations } });
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof BudgetSummaryApiError ? error.message : 'Something went wrong loading this budget.';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [budgetHeaderId, reloadToken]);

  return (
    <div className="budget-detail">
      <Link className="budget-detail__back" to="/budgeting">
        ← Back to Budgets
      </Link>
      <h1 className="budget-detail__heading">Budget Detail</h1>
      <p className="budget-detail__subheading">This budget's information, lines, releases, and reservations.</p>

      {state.status === 'loading' && <p className="budget-detail__status">Loading…</p>}
      {state.status === 'error' && <p className="budget-detail__status budget-detail__status--error">{state.message}</p>}
      {state.status === 'loaded' && (
        <BudgetDetailView
          data={state.data}
          onDataChanged={() => setReloadToken((t) => t + 1)}
          lastReturnReason={lastReturnReason}
          onReturned={(reason) => {
            setLastReturnReason(reason);
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function badgeClass(status: string): string {
  return `budget-detail__badge budget-detail__badge--${status}`;
}

function BudgetDetailView({
  data,
  onDataChanged,
  lastReturnReason,
  onReturned,
}: {
  data: DetailData;
  onDataChanged: () => void;
  lastReturnReason: string | null;
  onReturned: (reason: string) => void;
}) {
  const { header, version, cycle, summary, lines, releases, reservations } = data;

  // Only `draft` budgets allow line changes — this mirrors the ONE rule
  // the backend actually enforces today (BudgetLineService.remove()
  // rejects deletion once the header isn't `draft`). Create/update
  // aren't backend-gated the same way yet, but hiding Add/Edit here too
  // keeps the UI consistent with that rule rather than only half
  // applying it — see this file's header comment.
  const isEditable = header.status === 'draft';

  return (
    <>
      <section className="budget-detail__section">
        <div className="budget-detail__section-header">Budget Information</div>
        <div className="budget-detail__section-body">
          <dl className="budget-detail__info-grid">
            <div className="budget-detail__info-item">
              <dt>Fiscal Year</dt>
              <dd>{extractFiscalYear(cycle)}</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Budget Cycle</dt>
              <dd>{cycle.name}</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Version / Revision</dt>
              <dd>
                {version.name} (v{version.versionNumber})
              </dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Status</dt>
              <dd>
                <span className={badgeClass(header.status)}>{header.status}</span>
              </dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Responsibility Center</dt>
              <dd>{header.responsibilityCenter.name}</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Fund Source</dt>
              <dd>{header.fundSource.name}</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt title="No user-lookup endpoint exists in the current system.">Prepared By</dt>
              <dd className="budget-detail__muted">—</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Date Prepared</dt>
              <dd>{new Date(header.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt title="No remarks field exists on budget headers in the current system.">Remarks</dt>
              <dd className="budget-detail__muted">—</dd>
            </div>
            <div className="budget-detail__info-item">
              <dt>Total Approved Budget</dt>
              <dd className="budget-detail__amount">{formatPeso(header.totalAmount)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <HeaderActionsSection
        header={header}
        version={version}
        cycle={cycle}
        lines={lines}
        summary={summary}
        onDataChanged={onDataChanged}
        lastReturnReason={lastReturnReason}
        onReturned={onReturned}
      />

      <section className="budget-detail__section">
        <div className="budget-detail__section-header">Totals</div>
        <div className="budget-detail__section-body">
          <div className="budget-detail__totals-grid">
            <TotalStat label="Approved" value={summary.approvedAmount} accent="var(--navy)" />
            <TotalStat label="Released" value={summary.releasedAmount} accent="var(--blue)" />
            <TotalStat label="Reserved" value={summary.reservedAmount} accent="var(--amber)" />
            <TotalStat label="Obligated" value={summary.obligatedAmount} accent="var(--red)" />
            <TotalStat label="Available" value={summary.availableAmount} accent="var(--teal)" />
          </div>
          {!summary.isConsistent && (
            <p className="budget-detail__integrity-warning">
              Reserved ({formatPeso(summary.reservedAmount)}) and Obligated ({formatPeso(summary.obligatedAmount)})
              don't currently agree — this budget's figures may need review.
            </p>
          )}
        </div>
      </section>

      <BudgetLinesSection
        budgetHeaderId={header.id}
        lines={lines}
        isEditable={isEditable}
        onDataChanged={onDataChanged}
      />

      <ReleasesSection releases={releases} headerId={header.id} headerStatus={header.status} />

      <ReservationsSection reservations={reservations} cycle={cycle} header={header} />
    </>
  );
}

/**
 * Submit / Approve / Return-for-Revision all call the same existing
 * generic PATCH endpoint (see updateBudgetHeaderStatus's comment in
 * api.ts) with a different `status` value — there is still no
 * dedicated submit/approve/return endpoint the way reservations have
 * for their own lifecycle. Two real gaps this has always surfaced:
 *   1. The backend still does not validate that every transition is
 *      legal in general (BudgetHeaderService.update accepts any status
 *      regardless of the current one) — EXCEPT for the one new,
 *      narrow check added specifically for this task (see below).
 *   2. Approve/Return now DO require a genuinely separate permission
 *      (`budgeting.header.approve`) from ordinary create/edit/submit
 *      (`budgeting.header.manage`) — this is the one deliberate
 *      backend change made for the Approval workflow: a new
 *      permission row (data, not a schema change) plus a small,
 *      conditional check inside BudgetHeaderService.update() for the
 *      `approved` and "return" (submitted → draft) transitions
 *      specifically. Verified directly against the database that a
 *      BUDGET_OFFICER-only user genuinely lacks this permission while
 *      an ADMIN genuinely has it.
 *
 * IMPORTANT HONEST LIMITATION: "Budget Officers without approval
 * rights must not see these actions" is NOT achievable from the
 * frontend today — the JWT deliberately carries no permission/role
 * claims (see auth.service.ts's JwtPayload comment) and there is no
 * whoami/permissions-lookup endpoint anywhere in this system, so the
 * frontend has no way to know in advance whether the current user
 * holds `budgeting.header.approve`. The buttons below are shown to
 * anyone who can view this page; the actual authorization is enforced
 * SERVER-SIDE (a 403 with a clear message is what an unauthorized user
 * actually gets back). Building true proactive hiding would require a
 * new endpoint, which is out of scope here.
 *
 * "Submitted By"/"Approved By"/"Returned By" and their dates: same gap
 * as before — budget_headers has no dedicated columns for any of these
 * (only generic createdBy/updatedBy/createdAt/updatedAt, overwritten by
 * whichever transition happens next). The existing Core audit trigger
 * DOES permanently capture each transition with the correct actor and
 * timestamp (verified directly against the database), but there is no
 * endpoint to read audit_logs back to the frontend, so none of these
 * can be displayed here — shown as "—" with a tooltip, same as every
 * other honestly-flagged gap in this app.
 *
 * "Return remarks": budget_headers has no remarks column at all, so a
 * return reason cannot be persisted anywhere — see
 * ReturnForRevisionModal's comment. It's captured and shown once,
 * transiently, for this page visit only.
 *
 * Notifications: still no notification-creating service exists
 * anywhere in this backend (the `notifications` table exists in the
 * Core Platform schema, but nothing writes to it for any event) — none
 * was added here, per instruction not to build a new one.
 */
function HeaderActionsSection({
  header,
  version,
  cycle,
  lines,
  summary,
  onDataChanged,
  lastReturnReason,
  onReturned,
}: {
  header: BudgetHeaderListItem;
  version: BudgetVersionSummary;
  cycle: BudgetCycleSummary;
  lines: BudgetLineItem[];
  summary: BudgetAmountSummary;
  onDataChanged: () => void;
  lastReturnReason: string | null;
  onReturned: (reason: string) => void;
}) {
  const [pending, setPending] = useState<'submitted' | 'approved' | 'draft' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Same checks BudgetReviewPage shows in full — reused here (not
  // duplicated) as the actual pre-submission gate: "Budget contains
  // validation errors" now genuinely BLOCKS the Submit button, rather
  // than only being a soft heads-up as it is inside the Budget Line
  // Editor's own save action. That's a deliberate difference: saving
  // one line is a lighter-weight action than formally submitting the
  // whole budget for approval, which is exactly what this stricter gate
  // is for.
  const validationWarnings = checkBudgetValidation(lines, summary);

  async function runTransition(status: 'submitted' | 'approved' | 'draft', afterSuccess?: () => void) {
    setPending(status);
    setActionError(null);
    try {
      await updateBudgetHeaderStatus(header.id, status);
      setShowSubmitConfirm(false);
      setShowApproveConfirm(false);
      setShowReturnModal(false);
      afterSuccess?.();
      onDataChanged();
    } catch (error) {
      setActionError(
        error instanceof BudgetSummaryApiError ? error.message : 'Something went wrong updating this budget.',
      );
    } finally {
      setPending(null);
    }
  }

  function extractFiscalYear(c: BudgetCycleSummary): string {
    const match = c.code.match(/\d{4}/) ?? c.name.match(/\d{4}/);
    return match ? match[0] : c.name;
  }

  return (
    <>
      {header.status === 'submitted' && (
        <p className="budget-detail__submitted-banner">
          This budget has been submitted for approval and can no longer be edited.
        </p>
      )}

      {header.status === 'approved' && (
        <p className="budget-detail__approved-banner">
          This budget has been approved and is now the official budget.
        </p>
      )}

      {header.status === 'draft' && lastReturnReason && (
        <div className="budget-detail__returned-banner">
          <strong>This budget was returned for revision.</strong>
          <p>Reason: {lastReturnReason}</p>
          <p className="budget-detail__hint">
            (This reason isn't saved anywhere — see this page's notes — so it will disappear once you leave or
            reload this page.)
          </p>
        </div>
      )}

      {actionError && <p className="budget-detail__banner budget-detail__banner--error">{actionError}</p>}

      {header.status === 'draft' && (
        <section className="budget-detail__section">
          <div className="budget-detail__section-header">Budget Actions</div>
          <div className="budget-detail__section-body">
            {validationWarnings.length > 0 ? (
              <div className="budget-detail__validation-block">
                <p className="budget-detail__validation-heading">
                  This budget can't be submitted yet — resolve the following first:
                </p>
                <ul className="budget-detail__validation-list">
                  {validationWarnings.map((w) => (
                    <li key={w.label}>
                      <strong>{w.label}:</strong> {w.detail}
                    </li>
                  ))}
                </ul>
                <Link to={`/budgeting/budget-headers/${header.id}/review`} className="budget-detail__link-button">
                  Open full Budget Review →
                </Link>
              </div>
            ) : (
              <div className="budget-detail__action-row">
                <Link to={`/budgeting/budget-headers/${header.id}/review`} className="budget-detail__action-button budget-detail__action-button--secondary">
                  Review Before Submitting
                </Link>
                <button
                  type="button"
                  className="budget-detail__action-button budget-detail__action-button--primary"
                  disabled={pending !== null}
                  onClick={() => setShowSubmitConfirm(true)}
                >
                  Submit for Approval
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {header.status === 'submitted' && (
        <section className="budget-detail__section">
          <div className="budget-detail__section-header">Budget Summary</div>
          <div className="budget-detail__section-body">
            <dl className="budget-detail__info-grid">
              <div className="budget-detail__info-item">
                <dt>Fiscal Year</dt>
                <dd>{extractFiscalYear(cycle)}</dd>
              </div>
              <div className="budget-detail__info-item">
                <dt>Budget Cycle</dt>
                <dd>{cycle.name}</dd>
              </div>
              <div className="budget-detail__info-item">
                <dt>Version</dt>
                <dd>
                  {version.name} (v{version.versionNumber})
                </dd>
              </div>
              <div className="budget-detail__info-item">
                <dt>Total Approved Budget</dt>
                <dd className="budget-detail__amount">{formatPeso(header.totalAmount)}</dd>
              </div>
              <div className="budget-detail__info-item">
                <dt>Number of Budget Lines</dt>
                <dd>{lines.length}</dd>
              </div>
              <div className="budget-detail__info-item">
                <dt title="No user-lookup endpoint exists in the current system.">Submitted By</dt>
                <dd className="budget-detail__muted">—</dd>
              </div>
              <div className="budget-detail__info-item">
                <dt title="No dedicated submitted-date column exists — only generic updated_at, which gets overwritten by the next status change.">
                  Submitted Date
                </dt>
                <dd className="budget-detail__muted">—</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {header.status === 'submitted' && (
        <section className="budget-detail__section">
          <div className="budget-detail__section-header">Budget Actions</div>
          <div className="budget-detail__section-body">
            <div className="budget-detail__action-row">
              <button
                type="button"
                className="budget-detail__action-button budget-detail__action-button--primary"
                disabled={pending !== null}
                onClick={() => setShowApproveConfirm(true)}
              >
                Approve Budget
              </button>
              <button
                type="button"
                className="budget-detail__action-button budget-detail__action-button--danger"
                disabled={pending !== null}
                onClick={() => setShowReturnModal(true)}
              >
                Return for Revision
              </button>
            </div>
          </div>
        </section>
      )}

      {showSubmitConfirm && (
        <BudgetDecisionConfirmModal
          title="Submit Budget for Approval"
          confirmLabel="Submit Budget"
          confirmingLabel="Submitting…"
          message="You are about to submit this budget for approval. Once submitted, this budget will become read-only until returned or approved."
          cycle={cycle}
          version={version}
          totalAmount={header.totalAmount}
          lineCount={lines.length}
          submitting={pending === 'submitted'}
          onConfirm={() => runTransition('submitted')}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}

      {showApproveConfirm && (
        <BudgetDecisionConfirmModal
          title="Approve Budget"
          confirmLabel="Approve Budget"
          confirmingLabel="Approving…"
          message="You are about to approve this budget. Once approved, it becomes the official approved budget for this fiscal year and may proceed to budget releases."
          cycle={cycle}
          version={version}
          totalAmount={header.totalAmount}
          lineCount={lines.length}
          submitting={pending === 'approved'}
          onConfirm={() => runTransition('approved')}
          onCancel={() => setShowApproveConfirm(false)}
        />
      )}

      {showReturnModal && (
        <ReturnForRevisionModal
          submitting={pending === 'draft'}
          onConfirm={(reason) => runTransition('draft', () => onReturned(reason))}
          onCancel={() => setShowReturnModal(false)}
        />
      )}
    </>
  );
}

/**
 * Improves the previously-plain releases table with sorting and a
 * "New Release" link — link only shown when the header is `approved`
 * (matching the eligibility rule the backend now enforces). No new
 * cross-budget "Releases" list page was built: the existing
 * GET /budgeting/budget-releases endpoint only supports listing for
 * ONE header at a time (findAllForHeader), so a true organization-wide
 * release list would need a new endpoint — out of scope here. This is,
 * genuinely, "the existing Budget Releases page," just scoped to one
 * budget the same way it always has been.
 */
type ReleaseSortField = 'releaseDate' | 'releasedAmount';

function ReleasesSection({
  releases,
  headerId,
  headerStatus,
}: {
  releases: BudgetReleaseItem[];
  headerId: string;
  headerStatus: string;
}) {
  const [sortBy, setSortBy] = useState<ReleaseSortField>('releaseDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const sorted = [...releases].sort((a, b) => {
    const cmp =
      sortBy === 'releasedAmount'
        ? parseFloat(a.releasedAmount) - parseFloat(b.releasedAmount)
        : new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  function toggleSort(field: ReleaseSortField) {
    if (sortBy === field) setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }
  function sortIcon(field: ReleaseSortField) {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <section className="budget-detail__section">
      <div className="budget-detail__section-header budget-detail__section-header--with-action">
        <span>Releases ({releases.length})</span>
        {headerStatus === 'approved' && (
          <Link to={`/budgeting/budget-headers/${headerId}/releases/new`} className="budget-detail__add-button">
            + New Release
          </Link>
        )}
      </div>
      {releases.length === 0 ? (
        <p className="budget-detail__empty">No releases recorded for this budget yet.</p>
      ) : (
        <div className="budget-detail__table-wrap">
          <table className="budget-detail__table">
            <thead>
              <tr>
                <th>Release #</th>
                <th className="budget-detail__sortable" onClick={() => toggleSort('releaseDate')}>
                  Date{sortIcon('releaseDate')}
                </th>
                <th className="budget-detail__sortable" onClick={() => toggleSort('releasedAmount')}>
                  Released{sortIcon('releasedAmount')}
                </th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((release) => (
                <tr key={release.id}>
                  <td>{release.releaseNumber}</td>
                  <td>{new Date(release.releaseDate).toLocaleDateString()}</td>
                  <td className="budget-detail__amount">{formatPeso(release.releasedAmount)}</td>
                  <td className="budget-detail__amount">{formatPeso(release.reservedAmount)}</td>
                  <td className="budget-detail__amount">{formatPeso(release.availableAmount)}</td>
                  <td>
                    <span className={badgeClass(release.status)}>{release.status}</span>
                  </td>
                  <td>
                    <Link to={`/budgeting/budget-releases/${release.id}/reservations/new`} className="budget-detail__row-link">
                      + Reserve
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Improves the previously-plain reservations table with sorting and
 * Fiscal Year/Department columns — both come from data THIS page
 * already loaded (cycle, header) rather than a new fetch, since every
 * reservation shown here is necessarily under the SAME one budget.
 *
 * No standalone cross-budget "Reservations" list page was built, for
 * the same reason as Releases: the existing GET /budgeting/reservations
 * endpoint only supports listing by ONE budgetReleaseId or
 * budgetHeaderId at a time — there is no organization-wide reservation
 * list endpoint, so a true cross-budget page (with its own Fiscal
 * Year/Department filters spanning every budget) would need a new
 * endpoint. This is, genuinely, "the existing Budget Reservations
 * page," same as it's always been: scoped to one budget.
 *
 * "Requested By" / "Approved By": same gap as everywhere else in this
 * app — no user-lookup endpoint exists to resolve a raw user id to a
 * display name, shown honestly as "—".
 */
type ReservationSortField = 'createdAt' | 'reservationAmount';

function ReservationsSection({
  reservations,
  cycle,
  header,
}: {
  reservations: ReservationListItem[];
  cycle: BudgetCycleSummary;
  header: BudgetHeaderListItem;
}) {
  const [sortBy, setSortBy] = useState<ReservationSortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fiscalYear = extractFiscalYear(cycle);

  const sorted = [...reservations].sort((a, b) => {
    const cmp =
      sortBy === 'reservationAmount'
        ? parseFloat(a.reservationAmount) - parseFloat(b.reservationAmount)
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  function toggleSort(field: ReservationSortField) {
    if (sortBy === field) setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }
  function sortIcon(field: ReservationSortField) {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <section className="budget-detail__section">
      <div className="budget-detail__section-header">Reservations ({reservations.length})</div>
      {reservations.length === 0 ? (
        <p className="budget-detail__empty">No reservations recorded against this budget's releases yet.</p>
      ) : (
        <div className="budget-detail__table-wrap">
          <table className="budget-detail__table">
            <thead>
              <tr>
                <th>Release #</th>
                <th>Fiscal Year</th>
                <th>Department</th>
                <th className="budget-detail__sortable" onClick={() => toggleSort('reservationAmount')}>
                  Amount{sortIcon('reservationAmount')}
                </th>
                <th>Status</th>
                <th title="No user-lookup endpoint exists in the current system.">Requested By</th>
                <th title="No user-lookup endpoint exists in the current system.">Approved By</th>
                <th className="budget-detail__sortable" onClick={() => toggleSort('createdAt')}>
                  Created{sortIcon('createdAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((reservation) => (
                <tr key={reservation.id}>
                  <td>{reservation.budgetRelease.releaseNumber}</td>
                  <td>{fiscalYear}</td>
                  <td>{header.responsibilityCenter.name}</td>
                  <td className="budget-detail__amount">
                    <Link to={`/budgeting/reservations/${reservation.id}`} className="budget-detail__row-link">
                      {formatPeso(reservation.reservationAmount)}
                    </Link>
                  </td>
                  <td>
                    <span className={badgeClass(reservation.status)}>{reservation.status}</span>
                  </td>
                  <td className="budget-detail__muted">—</td>
                  <td className="budget-detail__muted">—</td>
                  <td>{new Date(reservation.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TotalStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="budget-detail__stat" style={{ ['--stat-accent' as string]: accent }}>
      <div className="budget-detail__stat-label">{label}</div>
      <div className="budget-detail__stat-value">{formatPeso(value)}</div>
    </div>
  );
}

function extractFiscalYear(cycle: BudgetCycleSummary): string {
  const match = cycle.code.match(/\d{4}/) ?? cycle.name.match(/\d{4}/);
  return match ? match[0] : cycle.name;
}

type LineSortField = 'accountCode' | 'description' | 'amount';

function BudgetLinesSection({
  budgetHeaderId,
  lines,
  isEditable,
  onDataChanged,
}: {
  budgetHeaderId: string;
  lines: BudgetLineItem[];
  isEditable: boolean;
  onDataChanged: () => void;
}) {
  // null = closed; { line: null } = Add mode; { line } = Edit mode.
  const [editorState, setEditorState] = useState<{ line: BudgetLineItem | null } | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<LineSortField>('accountCode');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? lines.filter((l) => l.accountCode.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q))
      : lines;

    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortBy === 'amount') cmp = parseFloat(a.amount) - parseFloat(b.amount);
      else if (sortBy === 'description') cmp = (a.description ?? '').localeCompare(b.description ?? '');
      else cmp = a.accountCode.localeCompare(b.accountCode);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [lines, search, sortBy, sortOrder]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / LINES_PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * LINES_PAGE_SIZE, page * LINES_PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : (page - 1) * LINES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * LINES_PAGE_SIZE, total);

  function toggleSort(field: LineSortField) {
    if (sortBy === field) setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  }
  function sortIcon(field: LineSortField) {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  }

  async function handleDelete(line: BudgetLineItem) {
    const label = line.description ? `${line.accountCode} — ${line.description}` : line.accountCode;
    if (!window.confirm(`Delete budget line "${label}"? This cannot be undone.`)) return;

    setDeletingId(line.id);
    setDeleteError(null);
    try {
      await deleteBudgetLine(line.id);
      onDataChanged();
    } catch (error) {
      setDeleteError(error instanceof BudgetSummaryApiError ? error.message : 'Something went wrong deleting this line.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="budget-detail__section">
      <div className="budget-detail__section-header budget-detail__section-header--with-action">
        <span>Budget Lines ({lines.length})</span>
        <button
          type="button"
          className="budget-detail__add-button"
          disabled={!isEditable}
          title={isEditable ? undefined : 'This budget is no longer in draft status, so lines can no longer be added.'}
          onClick={() => setEditorState({ line: null })}
        >
          + Add Budget Line
        </button>
      </div>

      {lines.length > 0 && (
        <div className="budget-detail__lines-toolbar">
          <input
            className="budget-detail__search"
            type="text"
            placeholder="Search by account code or title…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      )}

      {deleteError && <p className="budget-detail__banner budget-detail__banner--error">{deleteError}</p>}

      {lines.length === 0 ? (
        <p className="budget-detail__empty">No budget lines recorded.</p>
      ) : filtered.length === 0 ? (
        <p className="budget-detail__empty">No budget lines match your search.</p>
      ) : (
        <>
          <div className="budget-detail__table-wrap">
            <table className="budget-detail__table">
              <thead>
                <tr>
                  <th className="budget-detail__sortable" onClick={() => toggleSort('accountCode')}>
                    Account Code{sortIcon('accountCode')}
                  </th>
                  <th className="budget-detail__sortable" onClick={() => toggleSort('description')}>
                    Account Title{sortIcon('description')}
                  </th>
                  <th className="budget-detail__sortable" onClick={() => toggleSort('amount')}>
                    Approved Amount{sortIcon('amount')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((line) => (
                  <tr key={line.id}>
                    <td>{line.accountCode}</td>
                    <td>{line.description ?? '—'}</td>
                    <td className="budget-detail__amount">{formatPeso(line.amount)}</td>
                    <td className="budget-detail__actions">
                      <button
                        type="button"
                        className="budget-detail__link-button"
                        disabled={!isEditable}
                        title={isEditable ? undefined : 'This budget is no longer in draft status.'}
                        onClick={() => setEditorState({ line })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="budget-detail__link-button budget-detail__link-button--danger"
                        disabled={!isEditable || deletingId === line.id}
                        title={isEditable ? undefined : 'This budget is no longer in draft status, so lines can no longer be deleted.'}
                        onClick={() => handleDelete(line)}
                      >
                        {deletingId === line.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="budget-detail__pagination">
            <span>{total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}</span>
            <div className="budget-detail__pagination-buttons">
              <button
                type="button"
                className="budget-detail__page-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="budget-detail__page-button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {editorState && (
        <BudgetLineEditorModal
          budgetHeaderId={budgetHeaderId}
          line={editorState.line}
          existingCodes={lines.map((l) => l.accountCode)}
          onSaved={() => {
            setEditorState(null);
            // Triggers the page's full refetch — lines AND the backend
            // amount summary, so the Totals section updates from the
            // authoritative calculation, never a client-side sum.
            onDataChanged();
          }}
          onClose={() => setEditorState(null)}
        />
      )}
    </section>
  );
}
