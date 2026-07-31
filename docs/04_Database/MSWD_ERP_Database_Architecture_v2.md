# MSWD ERP — Database Architecture (Revision 2)

**Status: architecture only.** No Prisma models or SQL migrations have been
generated from this document. This revision applies four confirmed
business decisions and a full critical review. Review and approve before
any code is written.

---

## 0. What changed and why (read this first)

This is a full rewrite, not a patch, because two of the fixes below
(splitting `allotments` into a header+lines document, and restructuring
`checks`) touch enough surrounding structure that a diff would be harder
to read than a clean version. §20 lists every individual correction if you
want the itemized view.

---

## 1. Design principles (unchanged from Revision 1, restated)

1. One PostgreSQL database, multiple schemas — `core`, `budgeting`,
   `accounting`, `procurement`, `inventory`, `hr`.
2. `core` holds everything genuinely shared across modules.
3. Every master/lookup table is reusable across modules, never duplicated.
4. Standard columns on every transactional table (§3 — **now 7 columns,
   not 6** — see below).
5. Soft governance over hard deletion — nothing financially/legally
   significant is ever hard-deleted (§14 makes this a concrete policy,
   not just a principle).

---

## 2. Naming standards (unchanged, restated)

`snake_case` throughout; tables plural; PK always `id`; FK
`<table_singular>_id`; self-referencing FK prefixed by relationship name
(`parent_account_id`, `reports_to_id`); booleans `is_`/`has_`; timestamps
`_at` (always `timestamptz`); dates `_date`; money `_amount`
(`numeric(18,2)`); codes `_code`; status values are named Postgres `ENUM`
types, never free-text.

---

## 3. Standard columns — **revised: 7 columns, not 6**

```
id            uuid          primary key, default gen_random_uuid()
status        <enum>        table-specific status enum
created_at    timestamptz   default now()
updated_at    timestamptz   default now(), updated by trigger
created_by    uuid          references core.users(id)
updated_by    uuid          references core.users(id)
version       integer       not null default 1   -- NEW
```

**`version` is new in this revision.** It's an optimistic-concurrency
counter: every `UPDATE` increments it and the application must supply the
version it last read (`WHERE id = ? AND version = ?`). If zero rows
update, someone else changed the record first — the app re-reads and
retries instead of silently overwriting a concurrent change. This is a
**general** safety net for every transactional table; §12 describes the
**additional, stronger** mechanism used specifically for budget balances,
which needs row-locking, not just optimistic detection.

Master/lookup tables keep the simpler convention: `id`, `code`, `name`,
`is_active`, `created_at`, `updated_at` — no `version`/`status`, since
they aren't approved documents with concurrent-edit risk in the same way.

---

## 4. Multi-tenancy hook — `organization_id` (new)

**Gap found in Revision 1:** nothing in the design anticipated ever
running this ERP for more than one organization. Retrofitting
`organization_id` onto dozens of already-populated tables later is a
painful, high-risk migration.

**Fix, scoped to avoid over-building:** add a `core.organizations` master
table now, and an `organization_id` FK to every top-of-hierarchy master
table (`departments`, `fund_sources`, `banks`, `fiscal_years`,
`chart_of_accounts`, `users`). Everything else inherits organization scope
transitively through those tables' foreign keys, so it doesn't need its
own `organization_id` column.

**V1 ships with exactly one row in `core.organizations`.** No multi-org
switching logic, no per-org UI, no tenant isolation policy is being built
now — this is purely the same "leave a hook, don't build the feature yet"
pattern used for currency (§5). If multi-org deployment is ever needed,
it's a data-population exercise, not a schema migration.

---

## 5. Currency — PHP now, multi-currency-ready later

- `core.currencies` master table: `id`, `code` (ISO 4217, e.g. `PHP`),
  `name`, `symbol`. **V1 seeds exactly one row: `PHP`.**
- `core.organization_settings.default_currency_id` → `core.currencies`,
  set to PHP.
- **Every transactional table with a monetary amount gets a
  `currency_id` FK** (defaulting to the PHP row), even though only PHP is
  used in V1. This is the extensibility hook: when multi-currency is
  actually needed, it's a new `core.exchange_rates` table plus
  application logic — **not** an `ALTER TABLE` on every financial table,
  because the column already exists.
- All monetary columns are `numeric(18,2)`. **No `float`/`double
  precision` anywhere in the schema** — floating-point cannot represent
  money exactly and is explicitly disallowed.
- Exchange-rate/foreign-currency processing is explicitly **not** built
  in this revision, per the confirmed decision.

---

## 6. Employee ↔ User relationship (confirmed decision applied)

`hr.employees.user_id` is a **nullable** FK to `core.users(id)`.

- An employee record is a complete, valid HR master record with
  `user_id IS NULL`. No trigger, constraint, or application rule may
  require a user account to create or maintain an employee.
- A `core.users` row may also exist with no linked employee (e.g. an
  external auditor, a vendor portal account in a later phase) — the
  relationship is optional in both directions, enforced simply by the FK
  being nullable and never becoming `NOT NULL`.
- Provisioning a login for an existing employee is an `UPDATE` on
  `employees.user_id`, not a new employee record.

---

## 7. Chart of accounts, fiscal calendar, org structure (unchanged from Rev. 1)

| Table | Purpose |
|---|---|
| `core.organizations` | **New.** One row per organization (V1: one row). |
| `core.organization_settings` | Org-wide config: legal name, default currency, fiscal year start month. FK `organization_id`. |
| `core.departments` | Org units. Self-referencing `parent_department_id`. FK `organization_id`. |
| `core.responsibility_centers` | Budgetary accountability centers. FK `department_id`. |
| `core.fund_sources` | Source of funds (General Fund, Trust Fund, grants, etc.). FK `organization_id`. |
| `core.banks` | Bank institutions. FK `organization_id`. |
| `core.bank_accounts` | This organization's bank accounts. FK `bank_id`, `fund_source_id`, `currency_id`. |
| `core.fiscal_years` | One row per fiscal year. FK `organization_id`. |
| `core.accounting_periods` | Sub-periods (monthly) within a fiscal year. FK `fiscal_year_id`. |
| `core.chart_of_accounts` | GL account list. Self-referencing `parent_account_id`. FK `organization_id`. `account_type`, `normal_balance` enums. |
| `core.unit_of_measures` | UOM lookup shared by Procurement and Inventory. |
| `core.currencies` | **New.** Currency master (V1: PHP only). |

---

## 8. Identity, access, workflow, audit, attachments (unchanged structure, currency/org hooks added where relevant)

| Table | Purpose |
|---|---|
| `core.users` | Login accounts. FK `organization_id`. |
| `core.roles` | Named role. |
| `core.permissions` | Named fine-grained permission. |
| `core.role_permissions` | M:N join. |
| `core.user_roles` | M:N join, with optional `organization_unit_id` scoping. |
| `core.audit_logs` | Trigger-populated change log. See §15. |
| `core.attachments` | Polymorphic document metadata. See §16. |
| `core.workflow_templates` | Reusable approval-flow shape. |
| `core.workflow_template_steps` | Ordered steps, each tied to an approver role. |
| `core.workflow_instances` | One in-flight approval process, polymorphic subject. |
| `core.workflow_approvals` | One decision per step. |

**Segregation-of-duties rule, enforced at the workflow-engine level (new,
addresses the critical-review item directly):** the workflow engine must
reject any approval decision where `workflow_approvals.approver_user_id =
` the `created_by` of the subject document. This is a single global rule
in the approval-recording service, not a per-template configuration
option — nobody approves their own submission, ever, regardless of role.

---

## 9. Budgeting schema — **restructured**

**Gap found in Revision 1:** `allotments` was modeled as one flat row per
appropriation+period. In real government budgeting, a single Allotment
Release Order (ARO) commonly releases funds across *multiple*
appropriation lines in one document — the same header+lines pattern
already used for Purchase Requests, Purchase Orders, and Disbursement
Vouchers, which `allotments` was inconsistently missing. Fixed by
splitting it into a header and lines table, matching every other
document type in the system.

| Table | Purpose |
|---|---|
| `budgeting.appropriations` | Approved budget ceiling per responsibility center + fund source + fiscal year + account. FK `responsibility_center_id`, `fund_source_id`, `account_id`, `fiscal_year_id`, `currency_id`, `organization_id` (transitively via fiscal_year, not duplicated). |
| `budgeting.allotment_releases` | **New header.** One row per Allotment Release Order document. FK `accounting_period_id`. |
| `budgeting.allotment_release_lines` | **New.** One row per appropriation covered by a release. FK `allotment_release_id`, `appropriation_id`. Carries `allotted_amount numeric(18,2)`, `obligated_amount numeric(18,2) default 0`, and a **generated column** `available_amount numeric(18,2) GENERATED ALWAYS AS (allotted_amount - obligated_amount) STORED` — available balance can never drift out of sync with the other two, because Postgres computes it, nothing else writes to it. |
| `budgeting.obligation_requests` | Reserves budget against a specific allotment line before spending happens. FK `allotment_release_line_id` (**renamed from `allotment_id`** to point at the correct grain), `responsibility_center_id`. Split `approval_status` / `lifecycle_status` (see §13). |
| `budgeting.obligation_request_lines` | Line-item breakdown by account + amount. FK `obligation_request_id`, `account_id`. |
| `budgeting.budget_overrides` | **New.** See §12. |

---

## 10. Accounting schema

| Table | Purpose |
|---|---|
| `accounting.journal_entries` | GL posting header. FK `accounting_period_id`. Polymorphic `source_table`/`source_id` — every module's postings (DVs, collections, payroll, inventory valuation if ever enabled) flow through here as the single GL entry point. |
| `accounting.journal_entry_lines` | Debit/credit lines. FK `journal_entry_id`, `account_id`. `debit_amount`/`credit_amount numeric(18,2)`, `currency_id`. |
| `accounting.disbursement_vouchers` | The "DV" — request/approval to pay. FK `obligation_request_id`, `bank_account_id`, `currency_id`. Split `approval_status`/`lifecycle_status`. |
| `accounting.disbursement_voucher_lines` | Expense breakdown by account. |
| `accounting.checks` | **Restructured — see §11.** |
| `accounting.check_status_history` | **New — see §11.** |
| `accounting.collections` | Money received. FK `bank_account_id`, `fund_source_id`, `currency_id`, **`accounting_period_id` (new — was missing entirely in Rev. 1, needed for period-close reporting)**. |
| `accounting.bank_reconciliations` | Header, FK `bank_account_id`, `accounting_period_id`. |
| `accounting.bank_reconciliation_lines` | Reconciling items. |

**General Ledger and Trial Balance remain database views**, not tables —
unchanged from Revision 1, and still the correct call: they're aggregates
of `journal_entry_lines`, and storing them separately would create a
second source of truth.

---

## 11. Checks — full redesign (confirmed decision applied)

The temporary standalone Check Registry's structure is **not** carried
forward. The permanent model:

```
accounting.checks
  id                        uuid pk
  disbursement_voucher_id   uuid   NULL-able FK → disbursement_vouchers
  bank_account_id           uuid   FK → bank_accounts
  check_number              text
  amount                     numeric(18,2)
  currency_id                uuid   FK → currencies
  check_date                 date
  status                     check_status enum
                              (assigned, printed, released, cleared,
                               stale_dated, spoiled, voided)
  is_legacy_import           boolean default false
  legacy_source_reference    text    NULL-able (original temp-system id/number)
  legacy_imported_by         uuid    NULL-able FK → users
  legacy_imported_at         timestamptz NULL-able
  is_dv_link_validated       boolean default false
  dv_link_validated_by       uuid    NULL-able FK → users
  dv_link_validated_at       timestamptz NULL-able
  created_by / updated_by / created_at / updated_at / version   -- standard columns

  CHECK (is_legacy_import = true OR disbursement_voucher_id IS NOT NULL)
```

**Why `disbursement_voucher_id` is nullable but constrained:** a legacy
imported check predates the ERP and has no ERP-generated DV — it's
allowed a `NULL` link. Any **non-legacy** (ERP-generated) check is
required, at the database level via the `CHECK` constraint, to have a
real DV. This is the concrete implementation of "the permanent check
record must originate from an approved Disbursement Voucher."

**Why `is_dv_link_validated` exists separately from the link itself:** a
legacy check *can* later be manually matched to a real DV during
reconciliation (`disbursement_voucher_id` gets populated), but it must
not be treated as equivalent to an ERP-native check until someone
explicitly confirms the match — `is_dv_link_validated` stays `false` until
that confirmation happens, satisfying "must not be falsely linked...
unless manually validated" as an actual enforceable flag, not just a
convention.

```
accounting.check_status_history   -- new
  id            uuid pk
  check_id      uuid FK → checks
  from_status   check_status
  to_status     check_status
  changed_by    uuid FK → users
  changed_at    timestamptz
  remarks       text
```

Checks get their **own** ledger-style history table (same pattern as
`stock_ledger_entries` and `leave_credits`) rather than relying solely on
the generic `audit_logs` diff — a check's issue → release → clear →
void/spoil lifecycle is exactly the kind of high-scrutiny, frequently
audited sequence that deserves a purpose-built, human-readable trail in
addition to the generic audit log.

**Role restriction (confirmed decision applied):** assigning/confirming a
check number, printing, recording release, recording spoilage/voiding,
and updating clearing information are all gated behind a specific
`accounting.check.*` permission set (e.g. `accounting.check.assign_number`,
`accounting.check.print`, `accounting.check.record_release`,
`accounting.check.void`, `accounting.check.update_clearing`), granted
**only** to the Cashier role in `core.role_permissions`. This is enforced
at the application/service layer on every one of those actions, checking
the acting user's granted permissions before allowing the state change.

As a **defense-in-depth recommendation** (not required for V1, worth
knowing about): Postgres Row-Level Security (RLS) policies could
additionally enforce this at the database layer — e.g. a policy on
`UPDATE` to `checks` that checks a session variable
(`current_setting('app.current_user_permissions')`) set at the start of
each request. This protects against a bug in application code
accidentally skipping the permission check; it does not replace the
application-layer check, which is still required for good error
messages and workflow integration.

---

## 12. Budget concurrency control (new — addresses hard-enforcement decision)

**The risk:** two users submitting obligation requests against the same
allotment line at nearly the same moment could both read "sufficient
budget available," both pass validation, and both commit — over-spending
the allotment despite every individual check having "passed."

**The mechanism, used at every commitment-stage gate** (obligation
creation, PO/contract submission, PO/contract approval, PO/contract
issuance):

1. The service action runs inside a single database transaction.
2. It executes `SELECT ... FROM budgeting.allotment_release_lines WHERE
   id = :line_id FOR UPDATE` — this takes a row lock, so a second,
   concurrent request against the *same* allotment line blocks until the
   first transaction commits or rolls back. They cannot both proceed
   based on stale numbers.
3. It re-reads `available_amount` (the generated column) *after* acquiring
   the lock, and compares it against the amount being committed.
4. **If available_amount is sufficient:** proceed, update
   `obligated_amount` (which recomputes `available_amount`
   automatically), commit.
5. **If available_amount is insufficient:** the action is **blocked** —
   not just warned — unless a valid, already-approved
   `budget_overrides` row exists for this specific request (see below).
   The transaction rolls back with a clear error.

**Draft-stage behavior is different on purpose:** while a document is
still `draft`, the same balance check runs but only to display a warning
banner — nothing is locked or blocked, since nothing is being committed
yet. The hard block applies specifically at submission, approval, and
issuance — the actual commitment-stage actions named in the decision.

**Overrides:**

```
budgeting.budget_overrides
  id                    uuid pk
  subject_table          text        -- e.g. 'budgeting.obligation_requests'
  subject_id              uuid
  requested_by             uuid FK → users
  justification            text NOT NULL
  requested_amount_over    numeric(18,2)
  status                   override_status (pending, approved, rejected)
  approved_by              uuid NULL-able FK → users
  approved_at              timestamptz NULL-able
  created_at / updated_at / version
```

An override is itself a workflow-engine subject (`workflow_instances`
with `subject_table = 'budgeting.budget_overrides'`), so it goes through
the same approval-chain machinery as everything else, and inherits the
same segregation-of-duties rule (§8): the requester cannot also be the
approver. Only a role explicitly granted the
`budgeting.obligation.override_budget_limit` permission can be assigned
as the approver for this workflow template — **which specific role gets
that permission is an open policy question, listed in §21.**

Every override request, approval, and the resulting over-budget
commitment are captured both in `budget_overrides` itself and in the
generic `audit_logs` — satisfying "a complete audit-log entry" as an
enforced side effect of the mechanism, not a manual step someone could
forget.

---

## 13. Status handling — split approval/lifecycle status (new)

**Gap found in Revision 1:** a single `status` column on
high-complexity documents (obligations, POs, DVs, contracts) was being
asked to represent two genuinely different things — where a document is
in its **approval chain** (draft → pending approval → approved →
rejected/returned) versus where it is in its **business lifecycle**
(open → partially fulfilled → fulfilled → closed → cancelled). Conflating
these into one enum either produces an enum with confusing combined
values or silently loses information.

**Fix:** for `obligation_requests`, `purchase_orders`, `contracts`, and
`disbursement_vouchers` specifically (the four document types with real
multi-stage lifecycles), use **two** enum columns:

```
approval_status   approval_status_enum
                   (draft, pending_approval, approved, rejected, returned)
lifecycle_status  lifecycle_status_enum
                   (open, partially_fulfilled, fulfilled, closed, cancelled)
```

Simpler tables (`canvasses`, `stock_issuances`, `leave_applications`,
`physical_counts`, etc.) keep a single `status` column — they don't have
a meaningfully separate lifecycle beyond their approval state.

---

## 14. Deletion policy (new — explicit rules, not just a principle)

| Relationship type | Rule |
|---|---|
| FK from a transaction to master data (e.g. `purchase_orders.supplier_id`) | `ON DELETE RESTRICT`. Master data referenced by any transaction can never be deleted — deactivate via `is_active = false` instead. |
| FK from a document's lines to its own header (e.g. `purchase_order_lines.purchase_order_id`) | `ON DELETE CASCADE` is acceptable — lines have no independent existence, **and** the header itself is never hard-deleted once it leaves `draft` (next rule). |
| Any transactional row where `status`/`approval_status` ≠ its initial `draft`-equivalent value | **Never physically deleted.** Enforced by a `BEFORE DELETE` trigger that raises an exception unless the row is still in draft. Cancellation/voiding is a status transition, not a `DELETE`. |
| `audit_logs`, `check_status_history`, `workflow_approvals` | Never deleted, ever, by anyone, at any status — these tables have no delete path in the application at all. |

---

## 15. Audit trail — three layers (expanded from Revision 1)

1. **`core.audit_logs`** — generic, trigger-populated, covers every
   transactional table's every insert/update/delete attempt (including
   the ones the deletion trigger blocks — the blocked attempt itself is
   worth logging).
2. **`core.workflow_approvals`** — the approval-chain decision trail for
   any document routed through the workflow engine (who approved/rejected/
   returned, when, with what remarks).
3. **Purpose-built ledger/history tables** for the highest-scrutiny,
   physical-instrument-like lifecycles where a generic jsonb diff is
   harder for a human to audit at a glance: `accounting.check_status_history`
   (new, §11), alongside the existing `inventory.stock_ledger_entries` and
   `hr.leave_credits` (both already ledger-patterned in Revision 1).

---

## 16. Attachments (unchanged from Revision 1)

Polymorphic `core.attachments` (`attachable_table` + `attachable_id`),
serving every module. Referential integrity to the attached row is
enforced at the application layer, not a DB foreign key — an accepted,
explicit trade-off, not an oversight.

---

## 17. Procurement schema — **contracts table added**

**Gap found in Revision 1:** the confirmed decision explicitly calls out
"issuance of a Purchase Order **or contract**" as a commitment-stage
budget gate, but Revision 1 only modeled Purchase Orders — no separate
Contracts table existed for larger-value/infrastructure/consulting
procurement (a standard distinction in Philippine government procurement
between simple POs and formal Contracts).

| Table | Purpose |
|---|---|
| `procurement.suppliers` | Vendor master. |
| `procurement.supplier_contacts` | Contact persons. |
| `procurement.purchase_requests` | The "PR." FK `department_id`, `responsibility_center_id`, **`fiscal_year_id` (new — a PR exists before any obligation does, so it had no way to record fiscal year at all in Revision 1; now direct, not derived transitively).** |
| `procurement.purchase_request_lines` | Requested items. FK `item_id` (nullable — a PR line may be for a service, not a stocked item). |
| `procurement.canvasses` | Price canvass/RFQ. FK `purchase_request_id`. |
| `procurement.canvass_quotations` | Per-supplier quote. FK `canvass_id`, `supplier_id`. |
| `procurement.purchase_orders` | The "PO." FK `supplier_id`, `purchase_request_id`, `obligation_request_id`, `currency_id`. Split `approval_status`/`lifecycle_status`. |
| `procurement.purchase_order_lines` | Ordered items. FK `purchase_request_line_id`, `item_id`. |
| `procurement.contracts` | **New.** Formal contracts (infrastructure/consulting/large-value), parallel to Purchase Orders. FK `supplier_id`, `obligation_request_id`, `currency_id`. Split `approval_status`/`lifecycle_status`. Same budget-gate rules as POs (§12) apply identically. |
| `procurement.inspection_acceptance_reports` | The "IAR." FK `purchase_order_id` (nullable — an IAR can instead reference a `contract_id`, mutually exclusive, enforced by a `CHECK` constraint requiring exactly one of the two to be set). |
| `procurement.inspection_acceptance_report_lines` | Accepted quantities. |

---

## 18. Inventory & Property schema (one addition: traceability link)

Structurally unchanged from Revision 1 with one addition:

| Table | Purpose |
|---|---|
| `inventory.property_custodianships` | Adds **`source_iar_line_id`** (new, nullable FK → `inspection_acceptance_report_lines`) — traces a specific property/equipment unit back to the delivery that brought it in, closing a traceability gap from Revision 1. |

(`item_categories`, `items`, `warehouses`, `stock_ledger_entries`,
`stock_issuances`, `stock_issuance_lines`, `physical_counts`,
`physical_count_lines` are otherwise unchanged from Revision 1.)

---

## 19. Human Resources schema — **payroll linked into Budgeting/Accounting**

**Gap found in Revision 1:** HR's payroll process had no foreign key
into either Budgeting (payroll consumes a Personnel Services obligation)
or Accounting (payroll ultimately produces a Disbursement Voucher) — a
direct instance of the "missing links across modules" review item.

| Table | Purpose |
|---|---|
| `hr.positions` | Plantilla position. Nullable FK `appropriation_id` (a position may be tied to the appropriation line that funds it). |
| `hr.employees` | FK `department_id`, `position_id`, `reports_to_id` (self), **nullable** `user_id` (§6). |
| `hr.employee_bank_accounts` | Employee's payroll deposit account(s). |
| `hr.leave_types`, `hr.leave_credits`, `hr.leave_applications` | Unchanged from Revision 1. |
| `hr.payroll_periods` | FK `accounting_period_id`. |
| `hr.payroll_runs` | **New FKs:** `obligation_request_id` (nullable — links this payroll run to the Personnel Services obligation it draws against) and `disbursement_voucher_id` (nullable, populated once a batch DV is cut for the run's net pay total). |
| `hr.payroll_run_lines` | Per-employee computed pay. FK `payroll_run_id`, `employee_id`. |

---

## 20. Full list of corrections made in this revision

1. Applied confirmed decision: `employees.user_id` is nullable, no
   trigger/constraint may require it.
2. Added `budgeting.budget_overrides` table + workflow integration for
   controlled hard-budget-limit overrides.
3. Added the row-locking + generated-column concurrency mechanism (§12)
   for budget-availability checks — closes the "budget concurrency risk"
   review item directly.
4. Added `currency_id` to every monetary transactional table and a new
   `core.currencies` master (seeded with PHP only) — multi-currency
   extensibility hook without building the feature.
5. Confirmed no `float`/`double precision` anywhere; all money is
   `numeric(18,2)`.
6. Fully redesigned `accounting.checks` (§11): nullable-but-constrained
   `disbursement_voucher_id`, legacy-import fields, DV-link validation
   flag, dedicated `check_status_history` table, Cashier-only permission
   set for check lifecycle actions.
7. Added `version integer` to the standard transactional column set —
   general optimistic-concurrency protection (distinct from, and in
   addition to, the row-locking used specifically for budget checks).
8. Added `core.organizations` + `organization_id` on top-of-hierarchy
   master tables — multi-organization extensibility hook, one row
   populated in V1, no multi-tenant feature built.
9. Split `allotments` into `allotment_releases` (header) +
   `allotment_release_lines` (lines) — fixes an inconsistency where every
   other document type had a header+lines shape and this one didn't;
   also matches how Allotment Release Orders actually work (one release
   can cover multiple appropriation lines).
10. Renamed `obligation_requests.allotment_id` → `allotment_release_line_id`
    to point at the corrected grain.
11. Added `purchase_requests.fiscal_year_id` — a PR is created before any
    obligation exists, so it previously had **no** way to record fiscal
    year at all.
12. Added `accounting.collections.accounting_period_id` — was missing
    entirely; required for period-close reporting.
13. Split `approval_status` / `lifecycle_status` on `obligation_requests`,
    `purchase_orders`, `contracts`, `disbursement_vouchers` — fixes a
    single overloaded `status` column that was conflating two different
    concerns on the system's four most complex document types.
14. Added `procurement.contracts` (+ line-level tables as needed) as a
    formal-contract counterpart to Purchase Orders, since the confirmed
    hard-budget-enforcement decision explicitly names contracts as a
    commitment-stage gate that Revision 1 had no table for.
15. Added a `CHECK` constraint on `inspection_acceptance_reports`
    requiring exactly one of `purchase_order_id` / `contract_id` to be
    set.
16. Added `inventory.property_custodianships.source_iar_line_id` —
    traceability from a specific property unit back to its delivery.
17. Added `hr.payroll_runs.obligation_request_id` and
    `.disbursement_voucher_id` — closes the HR ↔ Budgeting ↔ Accounting
    gap.
18. Formalized an explicit deletion policy (§14): `RESTRICT` on
    master-to-transaction FKs, `CASCADE` only on owned header/lines,
    and a `BEFORE DELETE` trigger blocking removal of any non-draft
    transactional row.
19. Formalized a global segregation-of-duties rule in the workflow engine:
    an approver can never be the same user as the document's `created_by`,
    enforced once, centrally, rather than per-template configuration.
20. Expanded the audit-trail design to three explicit layers (§15) instead
    of relying on the generic log alone for high-scrutiny document types.
21. Documented (not yet built) Postgres Row-Level Security as a
    recommended defense-in-depth layer for Cashier-only check actions,
    for future consideration.

---

## 21. Unresolved questions requiring a business-policy decision

1. **Which specific role(s) may approve a budget override?** The
   mechanism (§12) requires a role with the
   `budgeting.obligation.override_budget_limit` permission, and that
   approver can never be the same person who requested the override —
   but *which* role that is (Budget Officer? General Manager? Board
   resolution?) is a policy call, not an architecture one.
2. **Inventory costing method:** does the organization want stock
   movements to post to the General Ledger automatically (perpetual
   inventory valuation), or is inventory tracked by quantity only in V1,
   with GL valuation handled separately/periodically? This affects
   whether `stock_ledger_entries` needs its own link into
   `journal_entries` now or later.
3. **Multi-currency timeline:** confirmed out of scope for V1 — is there
   a target version/date this becomes relevant, so the `exchange_rates`
   table design can be scheduled rather than indefinite?
4. **Multi-organization timeline:** same question as above, for the
   `organizations` hook — is this genuinely "maybe never" or "planned for
   version N"? Affects how much more we prepare for it now versus later.
5. **Legacy check import process:** who performs the manual
   DV-link-validation step for legacy checks, and is there a cutoff date
   after which un-validated legacy links are simply left `NULL`
   permanently rather than pursued?
6. **Position-funding enforcement:** `hr.positions.appropriation_id` is
   modeled as optional — should an employee's payroll actually be
   *blocked* if their position has no funded appropriation line, or is
   this purely informational in V1?
7. **Bank reconciliation segregation of duties:** should the same user
   who records collections into a bank account be database-restricted
   (not just policy-restricted) from also performing that account's
   reconciliation? If yes, this needs its own permission distinct from
   general Accounting access.

---

## 22. Proposed implementation order

1. **`core`** — foundation everything else depends on: organizations,
   currencies, users/roles/permissions, departments, fund sources, banks/
   bank accounts, fiscal years/accounting periods, chart of accounts,
   unit of measures, audit log infrastructure (trigger function),
   attachments, workflow engine.
2. **`budgeting`** — appropriations, allotment releases/lines,
   obligation requests/lines, budget overrides. Depends only on `core`.
3. **`accounting`** — journal entries/lines, disbursement vouchers/lines,
   checks + check status history, collections, bank reconciliations.
   Depends on `core` and `budgeting` (DVs reference obligations).
4. **`procurement`** — suppliers, purchase requests/lines, canvasses,
   purchase orders/lines, contracts, IARs/lines. Depends on `core` and
   `budgeting` (POs/contracts reference obligations).
5. **`inventory`** — item categories, items, warehouses, stock ledger,
   stock issuances, property custodianships, physical counts. Depends on
   `core` and `procurement` (stock-in is triggered by accepted IARs).
6. **`hr`** — positions, employees, employee bank accounts, leave,
   payroll. Depends on `core` (departments, accounting periods),
   `budgeting` (position funding, payroll obligations), and `accounting`
   (payroll's resulting disbursement voucher).

This order minimizes forward-references — nothing in an earlier schema
ever needs to point at a table defined in a later one.

---

## 23. ERD diagrams

Provided as separate files (see attached), all revised to reflect this
document:

- `erd-core-domain-v2.mermaid`
- `erd-budgeting-accounting-v2.mermaid`
- `erd-procurement-inventory-v2.mermaid`
- `erd-human-resources-v2.mermaid`

---

**No Prisma models or SQL migrations will be generated until this
revision is reviewed and approved.**
