import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  BudgetSummaryApiError,
  getBudgetCycle,
  getBudgetHeader,
  getBudgetHeaderSummary,
  getBudgetVersion,
  listBudgetReleasesForHeader,
  listReservationsForHeader,
} from '../api';
import { formatPeso } from '../format-peso';
import type {
  BudgetAmountSummary,
  BudgetCycleSummary,
  BudgetHeaderListItem,
  BudgetReleaseItem,
  BudgetVersionSummary,
  ReservationListItem,
} from '../types';
import './budget-dashboard.css';

/**
 * Budget Officer's daily-work dashboard for a single budget. Every piece
 * of data here comes from an endpoint that already existed before this
 * page was first enhanced — `getBudgetVersion`/`getBudgetCycle` are
 * frontend wrappers around endpoints that were already fully built.
 * Nothing on the backend changed for this page, then or now.
 *
 * "Recent audit activity" (requested in the original dashboard pass) is
 * still deliberately not implemented — no endpoint anywhere exposes
 * audit_logs to the frontend, and adding one is out of scope here too.
 */

interface DashboardData {
  header: BudgetHeaderListItem;
  version: BudgetVersionSummary;
  cycle: BudgetCycleSummary;
  summary: BudgetAmountSummary;
  releases: BudgetReleaseItem[];
  reservations: ReservationListItem[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DashboardData };

/**
 * A release is flagged once less than this fraction of its released
 * amount remains available. This is the ONE utilization/exhaustion
 * threshold this system defines — there is no separate DBM/COA-mandated
 * warning level anywhere in the backend, so this same constant is
 * reused for both "nearing exhaustion" and "utilization warning" rather
 * than inventing a second number.
 */
const EXHAUSTION_THRESHOLD = 0.15;

const RECENT_ITEM_LIMIT = 5;

export function BudgetDashboardPage() {
  const { budgetHeaderId } = useParams<{ budgetHeaderId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!budgetHeaderId) {
      setState({ status: 'error', message: 'No budget selected — open this page with a budget header in the URL.' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const header = await getBudgetHeader(budgetHeaderId);
        const [version, summary, releases, reservations] = await Promise.all([
          getBudgetVersion(header.budgetVersionId),
          getBudgetHeaderSummary(budgetHeaderId),
          listBudgetReleasesForHeader(budgetHeaderId),
          listReservationsForHeader(budgetHeaderId),
        ]);
        const cycle = await getBudgetCycle(version.budgetCycleId);

        if (!cancelled) {
          setState({ status: 'loaded', data: { header, version, cycle, summary, releases, reservations } });
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
  }, [budgetHeaderId]);

  return (
    <div className="budget-dashboard">
      <h1 className="budget-dashboard__heading">Budget Dashboard</h1>
      <p className="budget-dashboard__subheading">Read-only overview of this budget's standing.</p>

      {state.status === 'loading' && <p className="budget-dashboard__status">Loading budget summary…</p>}

      {state.status === 'error' && <p className="budget-dashboard__status budget-dashboard__status--error">{state.message}</p>}

      {state.status === 'loaded' && <DashboardContent data={state.data} />}
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const { header, version, cycle, summary, releases, reservations } = data;

  return (
    <>
      <BudgetIdentitySection header={header} version={version} cycle={cycle} />
      <AttentionAlertsSection headerId={header.id} releases={releases} reservations={reservations} />
      <AmountsSection headerId={header.id} summary={summary} />
      <div className="budget-dashboard__two-col">
        <RecentReleasesSection releases={releases} />
        <RecentReservationsSection reservations={reservations} />
      </div>
      <QuickLinksSection headerId={header.id} releases={releases} />
      <AuditActivityNote />
    </>
  );
}

/** "Selected fiscal year and current budget status" — the fiscal year
 * itself is conveyed through the budget cycle's name (e.g. "FY2026
 * Budget Cycle"), since no endpoint in the current system exposes the
 * raw fiscal_years row directly. Statuses are shown as small badges
 * covering only the real, existing enum values for each field —
 * cycle: planning/active/closed; version:
 * draft/submitted/approved/superseded/rejected; header:
 * draft/submitted/approved/rejected. No new statuses are invented. */
function BudgetIdentitySection({
  header,
  version,
  cycle,
}: {
  header: BudgetHeaderListItem;
  version: BudgetVersionSummary;
  cycle: BudgetCycleSummary;
}) {
  return (
    <section className="budget-dashboard__identity">
      <div className="budget-dashboard__identity-main">
        <div className="budget-dashboard__identity-title">
          {header.responsibilityCenter.name} — {header.fundSource.name}
        </div>
        <div className="budget-dashboard__identity-sub">
          {cycle.name} · {version.name} (v{version.versionNumber})
        </div>
      </div>
      <div className="budget-dashboard__identity-badges">
        <StatusBadge status={cycle.status} prefix="Cycle" />
        <StatusBadge status={version.status} prefix="Version" />
        <StatusBadge status={header.status} prefix="Budget" />
      </div>
    </section>
  );
}

/** Single consistent badge component reused for every status shown on
 * this page (cycle, version, header, reservation) — same visual
 * treatment everywhere, driven only by whatever real status string the
 * API returned. */
function StatusBadge({ status, prefix }: { status: string; prefix?: string }) {
  return (
    <span className={`budget-dashboard__badge budget-dashboard__badge--${status}`}>
      {prefix ? `${prefix}: ` : ''}
      {status}
    </span>
  );
}

/**
 * Consolidates every "needs attention" condition into one place, so the
 * Budget Officer sees a single, un-missable signal instead of hunting
 * through the page. Renders nothing at all when no condition applies —
 * there is no empty/placeholder alert box.
 *
 * Every condition here reuses logic and data already present elsewhere
 * on this page (or already computed by the backend):
 *  - pending approvals: reservations already fetched, filtered by the
 *    real `submitted` status
 *  - nearing exhaustion / utilization warning: the one existing
 *    EXHAUSTION_THRESHOLD heuristic, applied to releases already fetched
 *    (this system has no separate "utilization" concept from a
 *    release's own available/released ratio, so both requested alert
 *    types collapse to the same check)
 *  - rejected reservation activity: the real `rejected` status: this
 *    schema has no "failed" status, so "failed or rejected" maps to the
 *    one status that actually exists
 */
function AttentionAlertsSection({
  headerId,
  releases,
  reservations,
}: {
  headerId: string;
  releases: BudgetReleaseItem[];
  reservations: ReservationListItem[];
}) {
  const pending = reservations.filter((r) => r.status === 'submitted');

  const nearlyExhausted = releases.filter((r) => {
    const released = parseFloat(r.releasedAmount) || 0;
    const available = parseFloat(r.availableAmount) || 0;
    return released > 0 && available / released < EXHAUSTION_THRESHOLD;
  });

  const rejected = reservations.filter((r) => r.status === 'rejected');

  const hasAnyAlert = pending.length > 0 || nearlyExhausted.length > 0 || rejected.length > 0;
  if (!hasAnyAlert) return null;

  return (
    <section className="budget-dashboard__section budget-dashboard__section--warning" aria-live="polite">
      <div className="budget-dashboard__section-header">Attention Required</div>
      <ul className="budget-dashboard__activity-list">
        {pending.map((r) => (
          <li key={`pending-${r.id}`}>
            <Link to={`/budgeting/reservations/${r.id}`} className="budget-dashboard__activity-link">
              <span className="budget-dashboard__activity-amount">Awaiting approval — {formatPeso(r.reservationAmount)}</span>
              <span className="budget-dashboard__activity-meta">
                {r.subjectTable ?? 'Reservation'} · Release {r.budgetRelease.releaseNumber} · requested{' '}
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
        {nearlyExhausted.map((r) => (
          <li key={`exhausted-${r.id}`}>
            <Link to={`/budgeting/budget-headers/${headerId}`} className="budget-dashboard__activity-link">
              <span className="budget-dashboard__activity-amount budget-dashboard__activity-amount--warning">
                Nearing exhaustion — {formatPeso(r.availableAmount)} left
              </span>
              <span className="budget-dashboard__activity-meta">
                of {formatPeso(r.releasedAmount)} released under {r.releaseNumber}
              </span>
            </Link>
          </li>
        ))}
        {rejected.map((r) => (
          <li key={`rejected-${r.id}`}>
            <Link to={`/budgeting/reservations/${r.id}`} className="budget-dashboard__activity-link">
              <span className="budget-dashboard__activity-amount budget-dashboard__activity-amount--warning">
                Rejected — {formatPeso(r.reservationAmount)}
              </span>
              <span className="budget-dashboard__activity-meta">{r.subjectTable ?? 'Reservation'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Approved, released, reserved, obligated, and available amounts" —
 * all five come from the existing BudgetCalculationService summary
 * endpoint.
 *
 * IMPORTANT about the breakdown bar: Reserved and Obligated are NOT two
 * separate slices of money that add together. `obligatedAmount` is
 * re-derived independently from the transaction ledger specifically to
 * cross-check `reservedAmount` (see BudgetCalculationService — the
 * summary's own `isConsistent` flag is literally
 * `reservedAmount.equals(obligatedAmount)`), and `availableAmount` is
 * defined as `releasedAmount - obligatedAmount`, not
 * `releasedAmount - reservedAmount - obligatedAmount`. Stacking all
 * three as independent additive segments would double-count and could
 * show over 100%.
 *
 * So the bar itself has two real, non-overlapping segments —
 * Obligated and Available — which is the actual identity that sums to
 * Released. Reserved is displayed alongside with its own amount and
 * percentage (as requested), annotated against Obligated: when the two
 * agree (the normal case) that's shown as a plain confirmation; when
 * they disagree, that's surfaced as the same integrity signal this page
 * already carried before this change.
 */
function AmountsSection({ headerId, summary }: { headerId: string; summary: BudgetAmountSummary }) {
  const navigate = useNavigate();

  const released = parseFloat(summary.releasedAmount) || 0;
  const reserved = parseFloat(summary.reservedAmount) || 0;
  const obligated = parseFloat(summary.obligatedAmount) || 0;

  // Every percentage below is guarded against released === 0 — a brand
  // new, not-yet-released budget renders every portion at 0% instead of
  // dividing by zero.
  const pct = (amount: number) => (released > 0 ? Math.max(0, Math.min(100, (amount / released) * 100)) : 0);
  const reservedPct = pct(reserved);
  const obligatedPct = pct(obligated);
  const availablePct = released > 0 ? Math.max(0, 100 - obligatedPct) : 0;

  return (
    <section>
      <div className="budget-dashboard__grid">
        <div className="budget-stat budget-stat--total">
          <div className="budget-stat__label">Approved</div>
          <div className="budget-stat__value">{formatPeso(summary.approvedAmount)}</div>
        </div>

        {/* Released — opens the existing Budget Detail page, which is
            where this system's Releases are actually listed (there is
            no separate standalone Releases page). */}
        <button
          type="button"
          className="budget-stat budget-stat--released budget-stat--clickable"
          onClick={() => navigate(`/budgeting/budget-headers/${headerId}`)}
        >
          <div className="budget-stat__label">Released</div>
          <div className="budget-stat__value">{formatPeso(summary.releasedAmount)}</div>
        </button>

        {/* Reserved — same reasoning: the Detail page is where
            Reservations are actually listed for this header; there is
            no standalone Reservations page or status-filter to link
            into, so this opens the plain Detail page. */}
        <button
          type="button"
          className="budget-stat budget-stat--reserved budget-stat--clickable"
          onClick={() => navigate(`/budgeting/budget-headers/${headerId}`)}
        >
          <div className="budget-stat__label">Reserved</div>
          <div className="budget-stat__value">{formatPeso(summary.reservedAmount)}</div>
        </button>

        {/* Obligated — no existing page shows the raw transaction
            ledger, so this card stays read-only rather than linking
            anywhere invented. */}
        <div className="budget-stat budget-stat--obligated">
          <div className="budget-stat__label">Obligated</div>
          <div className="budget-stat__value">{formatPeso(summary.obligatedAmount)}</div>
        </div>

        {/* Available — the existing Budget Availability Inquiry page is
            genuinely built for exactly this question, so this is the
            one card that opens a different existing page. */}
        <button
          type="button"
          className="budget-stat budget-stat--available budget-stat--clickable"
          onClick={() => navigate('/budgeting/availability-inquiry')}
        >
          <div className="budget-stat__label">Available</div>
          <div className="budget-stat__value">{formatPeso(summary.availableAmount)}</div>
        </button>
      </div>

      <div className="budget-proportion">
        <div className="budget-proportion__caption">How the released amount is currently split</div>

        <div className="budget-proportion__bar" role="img" aria-label={`${obligatedPct.toFixed(0)}% obligated, ${availablePct.toFixed(0)}% available`}>
          {released === 0 ? (
            <div className="budget-proportion__segment--empty" />
          ) : (
            <>
              <div className="budget-proportion__segment--obligated" style={{ width: `${obligatedPct}%` }} />
              <div className="budget-proportion__segment--available" style={{ width: `${availablePct}%` }} />
            </>
          )}
        </div>

        <div className="budget-proportion__breakdown">
          <div className="budget-proportion__breakdown-row">
            <span className="budget-proportion__legend-dot" style={{ background: 'var(--amber)' }} />
            <span className="budget-proportion__breakdown-label">Reserved</span>
            <span className="budget-proportion__breakdown-amount">{formatPeso(summary.reservedAmount)}</span>
            <span className="budget-proportion__breakdown-pct">{released > 0 ? `${reservedPct.toFixed(1)}%` : '—'}</span>
          </div>
          <div className="budget-proportion__breakdown-row">
            <span className="budget-proportion__legend-dot" style={{ background: 'var(--red)' }} />
            <span className="budget-proportion__breakdown-label">Obligated</span>
            <span className="budget-proportion__breakdown-amount">{formatPeso(summary.obligatedAmount)}</span>
            <span className="budget-proportion__breakdown-pct">{released > 0 ? `${obligatedPct.toFixed(1)}%` : '—'}</span>
          </div>
          <div className="budget-proportion__breakdown-row">
            <span className="budget-proportion__legend-dot" style={{ background: 'var(--teal)' }} />
            <span className="budget-proportion__breakdown-label">Available</span>
            <span className="budget-proportion__breakdown-amount">{formatPeso(summary.availableAmount)}</span>
            <span className="budget-proportion__breakdown-pct">{released > 0 ? `${availablePct.toFixed(1)}%` : '—'}</span>
          </div>
        </div>
      </div>

      {!summary.isConsistent && (
        <p className="budget-dashboard__integrity-warning">
          Reserved ({formatPeso(summary.reservedAmount)}) and Obligated ({formatPeso(summary.obligatedAmount)}) don't
          currently agree — this budget's figures may need review.
        </p>
      )}
    </section>
  );
}

function RecentReleasesSection({ releases }: { releases: BudgetReleaseItem[] }) {
  const recent = [...releases]
    .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
    .slice(0, RECENT_ITEM_LIMIT);

  return (
    <section className="budget-dashboard__section">
      <div className="budget-dashboard__section-header">Recent Releases</div>
      {recent.length === 0 ? (
        <p className="budget-dashboard__empty">No releases recorded yet.</p>
      ) : (
        <ul className="budget-dashboard__activity-list">
          {recent.map((r) => (
            <li key={r.id}>
              <span className="budget-dashboard__activity-amount">{formatPeso(r.releasedAmount)}</span>
              <span className="budget-dashboard__activity-meta">
                {r.releaseNumber} · {new Date(r.releaseDate).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentReservationsSection({ reservations }: { reservations: ReservationListItem[] }) {
  const recent = [...reservations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_ITEM_LIMIT);

  return (
    <section className="budget-dashboard__section">
      <div className="budget-dashboard__section-header">Recent Reservations</div>
      {recent.length === 0 ? (
        <p className="budget-dashboard__empty">No reservations recorded yet.</p>
      ) : (
        <ul className="budget-dashboard__activity-list">
          {recent.map((r) => (
            <li key={r.id}>
              <Link to={`/budgeting/reservations/${r.id}`} className="budget-dashboard__activity-link">
                <span className="budget-dashboard__activity-amount">{formatPeso(r.reservationAmount)}</span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Quick links to existing Budgeting pages" — every link below is an
 * already-existing route; none of these are new. */
function QuickLinksSection({ headerId, releases }: { headerId: string; releases: BudgetReleaseItem[] }) {
  const releasedRelease = releases.find((r) => r.status === 'released');

  return (
    <section className="budget-dashboard__quick-links">
      <Link to="/budgeting" className="budget-dashboard__quick-link">
        ← All Budgets
      </Link>
      <Link to={`/budgeting/budget-headers/${headerId}`} className="budget-dashboard__quick-link">
        View Full Detail →
      </Link>
      {releasedRelease && (
        <Link
          to={`/budgeting/budget-releases/${releasedRelease.id}/reservations/new`}
          className="budget-dashboard__quick-link"
        >
          + New Reservation
        </Link>
      )}
    </section>
  );
}

/** Honest placeholder for the one requested priority this change could
 * not implement without adding a new API (explicitly out of scope) —
 * see this file's header comment. */
function AuditActivityNote() {
  return (
    <section className="budget-dashboard__section budget-dashboard__section--muted">
      <div className="budget-dashboard__section-header">Recent Audit Activity</div>
      <p className="budget-dashboard__empty">
        Not available yet — no endpoint currently exposes audit history to the frontend. Every change on this budget
        is already being recorded (see the Core audit system), it just isn't readable from here without adding a new,
        separate read endpoint.
      </p>
    </section>
  );
}
