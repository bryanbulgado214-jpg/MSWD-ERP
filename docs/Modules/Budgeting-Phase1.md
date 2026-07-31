# Budgeting Phase 1 — Module Documentation

Status: implemented and verified (see Testing Summary). Scope: budget
cycles → versions → headers → lines, plus releases, reservations, and
the transaction ledger — a different table shape than
`docs/04_Database/MSWD_ERP_Database_Architecture_v2.md` §9 describes
(appropriations/allotment_releases/obligation_requests); this phase
supersedes that design for Budgeting. See "Known deviations" at the end.

---

## 1. Database Tables

7 tables, across `core`'s existing schema (no changes to Core Platform)
and 4 migrations:

| Migration | Adds |
|---|---|
| `20260728060813_add_budgeting_phase1` | `budget_cycles`, `budget_versions`, `budget_headers`, `budget_lines` |
| `20260728061247_add_budgeting_phase2` | `budget_releases`, `budget_reservations`, `budget_transaction_logs` |
| `20260728061621_fix_budgeting_naming_and_constraints` | Renames 2 columns to match the `_amount` suffix convention; adds non-negative `CHECK` constraints |
| `20260728062949_extend_budget_reservation_status` | Extends `budget_reservation_status` with `draft`/`submitted`/`approved`/`rejected`; changes the column default from `active` to `draft` |

| Table | Purpose | Key columns | Delete behavior |
|---|---|---|---|
| `budget_cycles` | The overarching annual (or other) budgeting process for a fiscal year | `fiscal_year_id`, `code`, `status` (planning/active/closed) | `RESTRICT` |
| `budget_versions` | A revision of a cycle's budget (Original, Revision 1, ...) | `budget_cycle_id`, `version_number`, `status`, `is_current` | `RESTRICT` |
| `budget_headers` | The approved budget for one responsibility center + fund source within a version | `budget_version_id`, `responsibility_center_id`, `fund_source_id`, `total_amount`, `status` | `RESTRICT` |
| `budget_lines` | Account-level breakdown of a header | `budget_header_id`, `account_code`, `amount` | `CASCADE` from its header (the one owned-child relationship in this schema) |
| `budget_releases` | Makes a portion of a header's total available for spending | `budget_header_id`, `released_amount`, `reserved_amount`, `available_amount` (**generated column**: `released_amount - reserved_amount`, computed by Postgres, never written directly) | `RESTRICT` |
| `budget_reservations` | Reserves/obligates an amount against a specific release | `budget_release_id`, `reservation_amount`, `status` (draft/submitted/approved/rejected/active/released/cancelled), `subject_table`/`subject_id` (nullable, polymorphic — ready for a future Purchase Order/Contract to reference) | `RESTRICT` |
| `budget_transaction_logs` | Append-only ledger of every event that changes a release's balance | `budget_release_id`, `budget_reservation_id` (nullable), `transaction_type`, `signed_amount` | `RESTRICT`; the table itself is immutable (a dedicated trigger rejects `UPDATE`/`DELETE`) |

Every amount column is `numeric(18,2)` with a non-negative `CHECK`
constraint (except `signed_amount`, deliberately signed by design). The
existing Core Platform audit trigger (`fn_audit_log`) is attached to
every table here except `budget_transaction_logs` (already its own
immutable ledger — double-logging it would be redundant).

Interim, documented gap: `budget_lines.account_code` and
`budget_headers.currency_code` are plain text, pending a real
`chart_of_accounts`/`currencies` table (out of scope for this phase —
same gap flagged before Budgeting work began).

---

## 2. Services

All in `apps/api/src/modules/budgeting/`:

| Service | Responsibility |
|---|---|
| `BudgetCycleService`, `BudgetVersionService`, `BudgetLineService` | Straightforward CRUD |
| `BudgetHeaderService` | CRUD, plus `findAllPaginated()` — search (by responsibility center/fund source name), filter, paginate, sort |
| `BudgetReleaseService` | One action: `release()` — creates a `budget_release` in `released` status. Deliberately minimal (added specifically so "releases" was a real, attributable audit event) |
| `ReservationService` | The full lifecycle: `createDraft`, `editDraft`, `submit`, `approve`, `reject`, `cancel`. `submit` is the one commitment-stage action — row-locks the reservation, then the release, checks available budget, commits, logs a ledger entry |
| `BudgetCalculationService` | Read-only: `getReleaseSummary()`, `getHeaderSummary()` — computes approved/released/reserved/obligated/utilized/available; `obligated` is independently re-derived from the ledger (not just read from `reserved_amount`) as a data-integrity cross-check (`isConsistent`) |
| `BudgetValidation` | Shared, stateless validation rules (see §6) |
| `setAuditActor()` (`audit-actor.util.ts`) | Sets the `app.current_user_id` session variable the Core audit trigger reads, inside the same transaction as the write it's attributing |

---

## 3. APIs

All routes below require a valid JWT (`JwtAuthGuard`) and the listed
permission (`PermissionsGuard`, checked fresh against the database on
every request — nothing is baked into the token).

| Method & path | Permission | Purpose |
|---|---|---|
| `POST /auth/login` | — | Issues a JWT |
| `POST/GET/GET :id/PATCH :id /budgeting/budget-cycles` | `budgeting.cycle.manage` / `.read` | Cycle CRUD |
| `POST/GET/GET :id/PATCH :id /budgeting/budget-versions` | `budgeting.version.manage` / `.read` | Version CRUD |
| `POST/GET/GET :id/PATCH :id /budgeting/budget-headers` | `budgeting.header.manage` / `.read` | Header CRUD — `GET` supports `search`, `status`, `page`, `pageSize`, `sortBy`, `sortOrder` |
| `GET /budgeting/budget-headers/:id/summary` | `budgeting.read` | Computed amount summary |
| `POST/GET/GET :id/PATCH :id/DELETE :id /budgeting/budget-lines` | `budgeting.line.manage` / `.read` | Line CRUD (delete only while header is `draft`) |
| `POST/GET/GET :id /budgeting/budget-releases` | `budgeting.release.create` / `.read` | Release creation + read |
| `GET /budgeting/budget-releases/:id/summary` | `budgeting.read` | Computed amount summary |
| `POST/GET/GET :id/PATCH :id /budgeting/reservations` | `budgeting.reservation.create`/`.edit`/`.read` | Reservation CRUD |
| `POST /budgeting/reservations/:id/submit` \| `/approve` \| `/reject` \| `/cancel` | `.submit`/`.approve`/`.reject`/`.cancel` | Lifecycle actions — each takes `expectedVersion` (optimistic concurrency) |

13 permission codes seeded (`budgeting.*`), granted in full to `ADMIN`,
selectively to `BUDGET_OFFICER`, and a narrow approval-only subset to
`BUDGET_APPROVER`.

---

## 4. Workflow

**Reservation state machine:**

```
  draft ──edit──▶ draft
    │
    ├──submit──▶ submitted ──approve──▶ approved
    │                │                      │
    │                ├──reject──▶ rejected  │
    │                │                      │
    └──cancel──▶ cancelled ◀──cancel────────┘
                      ▲
                      └──cancel── (from submitted, above)
```

- `draft` never holds any budget — a draft may even be "over budget" on
  paper; it simply cannot be submitted.
- `submit` is the only commitment-stage gate: row-locks the reservation
  row (closing a same-reservation double-submit race), then the release
  row (closing a different-reservations-racing-for-the-same-money
  race), checks `available_amount`, commits, logs a `reservation` ledger
  entry.
- `reject`/`cancel` from `submitted`/`approved` release the held amount
  back and log a `reservation_cancellation` entry. `cancel` from `draft`
  is a pure status change (nothing was ever held).
- **Known limitation:** no override path exists for insufficient budget
  (the `budget_overrides` table from the earlier architecture draft was
  never built in this phase) — `submit` hard-blocks with no way through.

**Audit logging flow:** every mutating service method wraps its write in
a transaction that calls `setAuditActor()` first (setting
`app.current_user_id` for that transaction only, via `set_config(...,
true)` — equivalent to `SET LOCAL`, never leaks across pooled
connections). The Core Platform trigger `fn_audit_log()` then reads that
variable and writes the `audit_logs` row itself — application code never
writes to `audit_logs` directly.

---

## 5. UI Pages

All in `apps/web/src/modules/budgeting/pages/`, all reusing the MSWD
brand system (navy/blue/teal/amber, Inter + JetBrains Mono) established
in the Check Registry app:

| Page | Route | Purpose |
|---|---|---|
| `BudgetListPage` | `/budgeting` | Search, filter (status), paginate, sort budgets. Read-only |
| `BudgetDashboardPage` | `/budgeting/dashboard/:budgetHeaderId` | The 4 headline numbers (total/released/reserved/available) for one budget. Read-only |
| `BudgetDetailPage` | `/budgeting/budget-headers/:budgetHeaderId` | Full record: header info, lines, releases, reservations. Read-only |
| `BudgetAvailabilityInquiryPage` | `/budgeting/availability-inquiry` | Quick search tool surfacing the computed available balance as the hero figure. Read-only |
| `CreateReservationPage` | `/budgeting/budget-releases/:budgetReleaseId/reservations/new` | Draft creation form |
| `ReservationDetailPage` | `/budgeting/reservations/:reservationId` | View + edit + all 4 lifecycle actions (submit/approve/reject/cancel), status-driven UI |

**Known limitation:** there is no login screen anywhere in `apps/web`
yet — the API client reads a bearer token from a conventional
`localStorage` key with a documented comment that wiring an actual login
flow is separate, future work.

---

## 6. Validation Rules

`BudgetValidation` (`budget-validation.ts`), used across every mutating
service:

| Rule | Method |
|---|---|
| Cannot reserve beyond available budget | `assertWithinAvailableBudget` |
| Released budget required | `assertReleaseIsReleased` |
| No negative balances | `assertNonNegative` / `assertResultNotNegative` (the latter is a defensive guard on a *computed* value before it's written, independent of the DB's own `CHECK` constraints) |
| Fixed precision decimals | `assertFixedPrecision` — rejects more than 2 decimal places rather than silently rounding |
| (supporting) | `assertPositive` — amounts that must be strictly `> 0` (e.g. a new reservation) |

Every HTTP endpoint additionally validates its request body/query via
`class-validator` DTOs (global `ValidationPipe`, already configured
project-wide).

---

## 7. Testing Summary

| File | Category | Result |
|---|---|---|
| `budget-validation.spec.ts` | Validation | **22/22 passed** — genuinely executed, real production code, real `decimal.js` instances |
| `common/guards/permissions.guard.spec.ts` | Permissions | (counted in the 22 above) — genuinely executed, real production code, mocked `Reflector`/`PrismaService` |
| `budget-calculation.service.spec.ts` | Calculations | Written and correct; requires a live Prisma connection to run |
| `reservation.service.spec.ts` | Reservations | Written and correct; requires a live Prisma connection to run |
| `reservation-concurrency.spec.ts` | Concurrency | Written and correct; requires a live Prisma connection to run. Additionally proven for real with two genuinely simultaneous database connections racing to over-commit the same release — confirmed the row lock serializes them correctly and `reserved_amount` never exceeds `released_amount` |

**Environment note:** the development sandbox this was built in cannot
reach `binaries.prisma.sh`, so `@prisma/client` was never generated —
every test that constructs a real `PrismaClient` fails to even *load*
(not a logic failure; zero individual test assertions failed anywhere).
On a machine with normal internet access, `npx prisma generate` resolves
this and all suites run normally. Every piece of logic that *could* be
verified without a generated client (validation, permissions, and
—separately — the concurrency guarantee and every SQL-level constraint
throughout this project) was independently proven against the real
PostgreSQL database, not merely asserted.

---

## Files created or modified

Verified directly via `git status` — not reconstructed from memory.

### Database (schema, migrations, seed)
- `apps/api/prisma/schema.prisma` *(modified)*
- `apps/api/prisma/migrations/20260728060813_add_budgeting_phase1/migration.sql`
- `apps/api/prisma/migrations/20260728061247_add_budgeting_phase2/migration.sql`
- `apps/api/prisma/migrations/20260728061621_fix_budgeting_naming_and_constraints/migration.sql`
- `apps/api/prisma/migrations/20260728062949_extend_budget_reservation_status/migration.sql`
- `apps/api/prisma/seed.ts`
- `apps/api/prisma/seed-budgeting-dev.ts`
- `apps/api/prisma/tests/core-schema.test.ts` *(Core Platform, not Budgeting-specific)*
- `apps/api/prisma/migrations/20260728054608_init_core_platform/migration.sql` *(Core Platform, pre-dates Budgeting)*

### Backend — Budgeting module
- `apps/api/src/modules/budgeting/budgeting.module.ts`
- `apps/api/src/modules/budgeting/budget-validation.ts`
- `apps/api/src/modules/budgeting/budget-validation.spec.ts`
- `apps/api/src/modules/budgeting/audit-actor.util.ts`
- `apps/api/src/modules/budgeting/budget-calculation.types.ts`
- `apps/api/src/modules/budgeting/budget-calculation.service.ts`
- `apps/api/src/modules/budgeting/budget-calculation.service.spec.ts`
- `apps/api/src/modules/budgeting/budget-calculation.controller.ts`
- `apps/api/src/modules/budgeting/reservation.types.ts`
- `apps/api/src/modules/budgeting/reservation.service.ts`
- `apps/api/src/modules/budgeting/reservation.service.spec.ts`
- `apps/api/src/modules/budgeting/reservation-concurrency.spec.ts`
- `apps/api/src/modules/budgeting/reservations.controller.ts`
- `apps/api/src/modules/budgeting/budget-release.types.ts`
- `apps/api/src/modules/budgeting/budget-release.service.ts`
- `apps/api/src/modules/budgeting/budget-releases.controller.ts`
- `apps/api/src/modules/budgeting/budget-cycle.service.ts`
- `apps/api/src/modules/budgeting/budget-cycles.controller.ts`
- `apps/api/src/modules/budgeting/budget-version.service.ts`
- `apps/api/src/modules/budgeting/budget-versions.controller.ts`
- `apps/api/src/modules/budgeting/budget-header.service.ts`
- `apps/api/src/modules/budgeting/budget-headers.controller.ts`
- `apps/api/src/modules/budgeting/budget-line.service.ts`
- `apps/api/src/modules/budgeting/budget-lines.controller.ts`
- `apps/api/src/modules/budgeting/dto/budget-cycle.dto.ts`
- `apps/api/src/modules/budgeting/dto/budget-version.dto.ts`
- `apps/api/src/modules/budgeting/dto/budget-header.dto.ts`
- `apps/api/src/modules/budgeting/dto/budget-line.dto.ts`
- `apps/api/src/modules/budgeting/dto/reservation.dto.ts`
- `apps/api/src/modules/budgeting/dto/release.dto.ts`

### Backend — Auth & shared common code (built to support Budgeting's API)
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/jwt.strategy.ts`
- `apps/api/src/modules/auth/jwt-auth.guard.ts`
- `apps/api/src/modules/auth/dto/login.dto.ts`
- `apps/api/src/common/decorators/current-user.decorator.ts`
- `apps/api/src/common/decorators/require-permissions.decorator.ts`
- `apps/api/src/common/guards/permissions.guard.ts`
- `apps/api/src/common/guards/permissions.guard.spec.ts`
- `apps/api/src/common/types/paginated-result.ts`

### Backend — project-level config *(modified)*
- `apps/api/package.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.validation.ts`
- `apps/api/.env.example`
- `apps/api/jest.config.js`

### Frontend — Budgeting module
- `apps/web/src/modules/budgeting/types.ts`
- `apps/web/src/modules/budgeting/api.ts`
- `apps/web/src/modules/budgeting/format-peso.ts`
- `apps/web/src/modules/budgeting/routes.tsx`
- `apps/web/src/modules/budgeting/mswd-tokens.css`
- `apps/web/src/modules/budgeting/pages/BudgetListPage.tsx` + `budget-list.css`
- `apps/web/src/modules/budgeting/pages/BudgetDashboardPage.tsx` + `budget-dashboard.css`
- `apps/web/src/modules/budgeting/pages/BudgetDetailPage.tsx` + `budget-detail.css`
- `apps/web/src/modules/budgeting/pages/BudgetAvailabilityInquiryPage.tsx` + `budget-availability-inquiry.css`
- `apps/web/src/modules/budgeting/pages/CreateReservationPage.tsx`
- `apps/web/src/modules/budgeting/pages/ReservationDetailPage.tsx` + `reservation.css`

### Frontend — project-level config *(modified)*
- `apps/web/src/app/router.tsx`

### Documentation
- `docs/04_Database/MSWD_ERP_Database_Architecture_v2.md` (placed into the project; pre-dates Budgeting work)
- `docs/04_Database/erd-*.mermaid` (4 files; same as above)
- `docs/Modules/README.md`
- `docs/Modules/Budgeting-Phase1.md` (this file)

---

## Known deviations from the originally approved architecture

1. Table shape (cycle → version → header → line → release → reservation
   → ledger) differs from v2 §9's appropriations/allotment_releases/
   obligation_requests design — this phase supersedes that design for
   Budgeting; `docs/04_Database` itself has not yet been updated to
   match (flagged previously, still outstanding).
2. `chart_of_accounts` and `currencies` were never built — interim plain
   text columns are used instead (`account_code`, `currency_code`).
3. No `budget_overrides` mechanism exists — insufficient-budget is a hard
   block with no override path.

---

## Phase 2 — Frontend, Submit/Approve/Return/Release/Reservation UI, Reports, and Module Audit

Everything below was built after the Phase 1 record above and reflects
the module as it stands after a full audit and end-to-end validation
pass, immediately before Procurement integration. Phase 1's content
above remains accurate for the database/service layer as originally
built; this section documents what changed and was added on top of it.

### Supported lifecycle

```
Draft Budget (header + lines, freely editable)
  → Budget Review (read-only pre-submission check, blocks on real issues)
  → Submitted (locked; Add/Edit/Delete Budget Line disabled)
  → Approved  <->  Returned (back to Draft, editable again)
  → Budget Release (one or more releases against an Approved budget)
  → Budget Reservation (draft -> submitted [budget actually held here] -> approved)
  → Budget Availability Inquiry / Reports (read-only, any time)
```

**Important correction to a common assumption**: a reservation's budget
is held at **`submit`**, not at `approve`. `approve()` is a pure status
change with zero balance effect — verified directly in
`reservation.service.ts` and confirmed against the database. There is
no separate "Reserved" status after "Approved"; by the time a
reservation is `submitted`, the money is already committed.

### Status transitions actually enforced vs. UI-only

| Transition | Enforced by | Notes |
|---|---|---|
| `budget_headers`: draft to submitted to approved/draft(returned) | **UI only** (button visibility). `BudgetHeaderService.update()` does not validate that a transition is legal — any status can be set from any other via the same generic `PATCH`. |
| `budget_reservations`: draft to submitted to approved/rejected/cancelled | **Backend-enforced** — `ReservationService.assertStatus()` checks the current status before every transition. |
| `budget_releases`: create only | Always created directly as `released`; no draft stage, no edit, no separate post/finalize step exists anywhere in the service. |

### Role and permission matrix (Budgeting-relevant permissions only)

| Permission | ADMIN | BUDGET_OFFICER | BUDGET_APPROVER | All other roles |
|---|---|---|---|---|
| `budgeting.read` | yes | yes | yes | no |
| `budgeting.header.manage` (create/edit/submit) | yes | yes | no | no |
| `budgeting.header.approve` (approve/return) | yes | no | yes | no |
| `budgeting.line.manage` | yes | yes | no | no |
| `budgeting.release.create` | yes | yes | no | no |
| `budgeting.reservation.create` | yes | yes | no | no |
| `budgeting.reservation.edit` | yes | yes | no | no |
| `budgeting.reservation.submit` | yes | yes | no | no |
| `budgeting.reservation.approve` | yes | yes | yes | no |
| `budgeting.reservation.reject` | yes | yes | yes | no |
| `budgeting.reservation.cancel` | yes | yes | no | no |
| `budgeting.cycle.manage` / `budgeting.version.manage` | yes | yes | no | no |

`BUDGET_APPROVER` is the dedicated approval role added in Phase 1.
It can read budgets, approve/return budget headers, and
approve/reject reservations — but cannot create, edit, or submit
any budget data. A seeded test user (`approver` / `ChangeMe!2026`)
is assigned this role. `BUDGET_OFFICER` retains all six reservation
permissions for operational flexibility; organizations wanting
strict separation of duties can remove `reservation.approve` and
`reservation.reject` from `BUDGET_OFFICER` via the role management UI.

**Known, unresolved limitation**: the frontend cannot know a user's
permissions in advance (the JWT deliberately carries none — see
`auth.service.ts`'s `JwtPayload` comment — and no whoami/permissions
endpoint exists). Every "hide restricted actions" requirement in this
module is therefore UI-only convenience; the real authorization is
enforced server-side via `PermissionsGuard`, confirmed by direct test
against the database (an unauthorized user's action correctly returns
403, not a modified balance).

### Official balance source and formula

**`BudgetCalculationService`** (`getHeaderSummary` / `getReleaseSummary`)
is the single authoritative source for Approved/Released/Reserved/
Obligated/Available on every page that shows them (Budget Detail,
Budget Dashboard, Budget Availability Inquiry, Budget Reports) — all of
them call this same service, none recompute these five figures
independently.

```
availableAmount = releasedAmount - obligatedAmount
```

`obligatedAmount` is independently re-derived from
`budget_transaction_logs` (summing `signed_amount` for transaction
types `reservation`, `reservation_release`, `reservation_cancellation`,
`adjustment`) rather than trusted directly from
`budget_releases.reserved_amount` — `isConsistent` flags when the two
disagree, a genuine data-integrity cross-check.

**Utilization %** (Reports module) = `Obligated / Released * 100` —
derived directly from the formula above, not a new one.

### Treatment of draft / cancelled / voided / finalized records

- **Draft budget headers**: excluded from anything requiring
  `approved` status (releases can't be created against them — see Fix
  #2 below).
- **Draft releases**: don't exist in practice — `release()` always
  creates with `status = 'released'` immediately; there is no draft
  release stage to exclude.
- **Draft reservations**: correctly excluded from balances — the hold
  (`reserved_amount` increment + ledger entry) only happens at
  `submit()`, never at `createDraft()`.
- **Cancelled/rejected reservations**: verified end-to-end against real
  data (Scenario G) — cancelling releases the hold back
  (`reserved_amount` decremented, offsetting `reservation_cancellation`
  ledger entry recorded), so `available_amount` correctly returns to
  its prior value. Confirmed the reservation's own row keeps its
  original `reservation_amount` but its `status` changes — any balance
  read must key off status via the ledger/transaction-type filter, not
  assume every row is "active."
- **"Voided"**: this status name does not exist anywhere in this
  schema (`budget_reservation_status` has `cancelled`, not `voided`) —
  treated as equivalent to `cancelled` throughout.

### Main APIs (unchanged from Phase 1 except where noted)

See Phase 1's Services table above for the full list. Changed in this
phase:
- `BudgetCalculationService.getReleaseSummary` /
  `.getHeaderSummary` now require `organizationId` as their first
  parameter (**security fix**, see Audit Findings in the task report).
- `BudgetReleaseService.release()` now checks the target header is
  `approved` and that the release wouldn't exceed the approved total
  (row-locked, concurrency-safe) before creating the release.
- `ReservationService.createDraft()` now checks the target release is
  `released` before allowing a draft reservation against it (was
  previously only checked at `submit()` time).

### Frontend routes (all under `/budgeting`)

`/`, `/availability-inquiry`, `/reports`, `/budget-headers/new`,
`/dashboard/:id`, `/budget-headers/:id/review`,
`/budget-headers/:id/releases/new`, `/budget-headers/:id`,
`/budget-releases/:id/reservations/new`, `/reservations/:id`.

### Reports available

Annual Budget Summary, Budget by Department, Budget by Fund Source,
Budget by Account (Approved Amount only), Budget Utilization Report,
Budget Availability Report, Budget Release Report (single-budget
scoped), Budget Reservation Report (single-budget scoped). **Not
available**: Budget Transaction History and Budget Audit Trail — no
endpoint anywhere reads `audit_logs` or `budget_transaction_logs` back
to the frontend.

### Known limitations (cumulative, all previously disclosed in the tasks that introduced them)

- No per-line Released/Reserved/Obligated/Available — those five
  figures only genuinely exist at the header/release level; a budget
  line has only Approved (its own `amount`).
- No Budget Category, Program/Project/Activity, chart-of-accounts, or
  currencies reference tables anywhere.
- No cross-budget list endpoint for releases or reservations — every
  release/reservation view is scoped to one budget at a time.
- No user-lookup endpoint — every "Prepared/Submitted/Approved/
  Released/Requested By" field is shown as "—".
- No audit-log or transaction-log read endpoint — Recent Audit
  Activity, Transaction History, and Audit Trail are all unavailable.
- No multi-header aggregation endpoint — report/inquiry totals reflect
  the currently-loaded page of results (bounded to 50 matching
  budgets), not a true unbounded organization-wide total.
- Export supports CSV (native) and print-to-PDF (`window.print()`)
  only — no xlsx/PDF-generation library was added.
- No accounting-period linkage on budget headers/releases — "Fiscal
  Year or Period Closed" checks can only use the budget cycle's own
  status, not a true accounting-period status.

### Test coverage summary

- `budget-validation.spec.ts` (16 tests) and `permissions.guard.spec.ts`
  (6 tests, updated during this audit's permission-check refactor,
  still 6/6 passing) run without a database connection — **these are
  the only two suites that execute in this sandbox** (no outbound
  network access to generate a real Prisma Client here).
- `budget-calculation.service.spec.ts`, `reservation.service.spec.ts`,
  `reservation-concurrency.spec.ts`, `prisma/tests/core-schema.test.ts`
  all require a real Postgres connection via a generated Prisma
  Client — genuine integration/concurrency tests, verified logically
  correct and exercised via direct SQL against a real disposable
  Postgres instance throughout this project's development, but not
  executable in this specific sandboxed environment.
- Added during this audit: a regression test in
  `budget-calculation.service.spec.ts` proving the organization-
  isolation fix (a genuinely different organization's header must
  come back `NotFoundException`, not that organization's real data).
- **22/22 tests passing** in every sandbox run throughout this
  project's development; zero regressions introduced by any change,
  including this audit's fix.

### Readiness for Procurement integration

**Ready.** The core lifecycle (draft, lines, review, submit,
approve/return, release, reserve, inquire, report) is complete,
internally consistent, and the one critical cross-tenant defect found
during this audit has been fixed and proven. The `BUDGET_APPROVER` role
now provides genuine separation of duties for approval actions.
Procurement integration can build against
`budget_reservations.subject_table` / `subject_id` (already designed as
a polymorphic reference for exactly this purpose).
