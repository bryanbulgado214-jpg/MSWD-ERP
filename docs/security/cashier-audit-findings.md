# Authorization audit — findings & triage

From the Phase 1 discovery for the Cashier role (accounting scope). The cashier work
addressed the items marked **Fixed**; the rest are **pre-existing holes found but NOT
fixed** (out of the accounting-cashier scope you set), listed here for triage.

## Fixed as part of the cashier work

- **Cashier could reach GL/TB/FS via the broad `accounting.read`.** Split off `accounting.check.read`; the cashier no longer holds `accounting.read`. (Enforced + tested.)
- **One permission authorized check release _and_ void _and_ clearing.** Void/spoil split to a separate `accounting.check.void` endpoint, approver-only.
- **No maker–checker on check void.** `voidCheck` now rejects the preparer/printer/releaser; only a different approver (GM) may void. (`printedBy` added to the model.)
- **No route-coverage safety net for the fail-open guard, in accounting.** Added `accounting-route-coverage.spec.ts`.

## Pre-existing holes — NOT fixed (need triage)

### ✅ 1. `PermissionsGuard` fails OPEN — FIXED

`apps/api/src/common/guards/permissions.guard.ts` now **fails closed**: a route behind the
guard that declares neither `@RequirePermissions` nor the new `@AuthenticatedOnly()` opt-out
is **denied** (403), instead of passing any authenticated user. A forgotten decorator can no
longer silently expose an endpoint — it surfaces immediately as a denial. Audit at the time
of the fix: all 396 routes across the 68 guarded controllers already declared
`@RequirePermissions`, so nothing broke. `permissions.guard.spec.ts` asserts both the
fail-closed default and the `@AuthenticatedOnly` escape hatch.
**Residual (separate):** this hardens controllers that _use_ PermissionsGuard. Controllers
that omit the guard entirely (e.g. `notification`, #2) are unaffected — a global `APP_GUARD`

- `@Public()` allowlist would additionally catch those, and remains a good follow-up.

### 🟡 2. `notification` controller mutations are ungated

`notification.controller.ts` — `PATCH /:id/read`, `POST /mark-all-read` use `JwtAuthGuard`
only (no `PermissionsGuard`, no `@RequirePermissions`). Any authenticated user can call
them; low blast radius (service scopes to `user.userId`). Fix: add the guard + a
`notification.read`/`.manage` permission, or the global-guard fix in #1.

### 🟠 3. `JevService.void` can void a POSTED journal entry

`accounting/jev.service.ts` — `void()` accepts `posted` status with **no** actor/SoD check
and **no** open-period guard, removing the entry from the GL **without a compensating
reversal** (the sanctioned `reverse()` path). Accountant-side GL-integrity issue, not the
cashier's path. **Recommend:** block voiding posted entries (force `reverse()`), or require
a distinct approver + open period.

### 🟠 4. Accounting DV is a one-person create→post

`accounting/disbursement.service.ts` — a non-draft DV sets creator = certifier = approver =
releaser and posts the auto-JEV, all under a single `accounting.dv.create`. (This is the DV
flow as originally requested.) **Recommend:** add a certify/approve step with a different
approver if you want DV preparation itself to be dual-control.

### 🟡 5. ~20 endpoints gated on permission codes that don't exist

Whole **procurement DV & inspection** controllers and most **inventory** transaction routes
require codes absent from the catalog (e.g. `procurement.dv.create`, `inventory.ris.manage`).
Because the guard fails _closed_ on an unknown required code, these are **deny-all /
unreachable** — safe, but the features are dead. (This is why the working disbursement flow
lives in `accounting.dv.*`, not `procurement.dv.*`.) **Recommend:** add the missing codes to
the catalog, or retire the dead controllers.

### 🟡 6. Sensitive ops gated by a broader/other permission than intended

- Period lock/close/reopen → `accounting.bank.manage` (the dedicated `accounting.period.manage` / `core.fiscal_period.manage` are defined but unused).
- Bank reconciliation create **and** approve → both `accounting.bank.manage` (no maker/checker).
- `POST /workorders/:id/notes` and `POST /complaints/:id/notes` → gated by a `*.read` permission.

### 🟡 7. Other, informational

- **OR (official receipt) number is client-supplied** (`billing/payment.service`) with only a uniqueness check — not a gapless, system-forced sequence. `billing.payment.void` has no maker≠checker. (Billing/collection scope — deferred.)
- **Audit trail does not capture IP / terminal** (only actor + timestamp + before/after). Append-only and un-purgeable otherwise.
- Web `MODULE_GATES` is a hand-maintained duplicate of the permission catalog.
