# Cashier role — Accounting (disbursement)

> Scope of this document: the **Cashier**'s role _within the Accounting module_. The
> cashier disburses funds by check; a separate `BILLING_CASHIER` role handles water-bill
> collections (out of scope here). "May also collect" is a future one-line grant of
> `billing.payment.collect` — deliberately not enabled yet.

## Principle: the accountant records, the cashier disburses

Preparing a Disbursement Voucher (DV) posts the accounting entry to the general ledger —
that is **recording**, and it stays with the accountant. Assigning the physical check
number, printing, and releasing the check is **disbursing** — that is the cashier. No one
person both records a disbursement to the GL and hands out the money.

## What the cashier CAN do (granted permissions)

| Capability                                                            | Permission                                    | Notes                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| View the check register + a check's supporting DV                     | `accounting.check.read`, `accounting.dv.read` | read-only                                                                              |
| Assign the check number + print (pending → printed)                   | `accounting.check.print`                      | the cashier holds the physical checks; the number is entered here, once, at print time |
| Record release (printed → released) and clearing (released → cleared) | `accounting.check.record_release`             | forward lifecycle only                                                                 |
| Cashiering dashboard                                                  | (uses the two read permissions)               | landing page — checks to print/issue                                                   |

The cashier's UI shows **only** the Cashiering Dashboard, Disbursement Vouchers, and Checks
tabs — every other accounting screen is hidden (not merely disabled), because the cashier
lacks the permission that gates it.

## What the cashier CANNOT do (enforced server-side)

Enforced by _not granting_ the code — the `PermissionsGuard` denies every route whose
permission the cashier does not hold. Verified by API tests, not just UI hiding.

- Record to the GL / post journal entries — `accounting.jev.*`
- **Prepare a DV** (posts to the GL) — `accounting.dv.create`
- Chart of accounts, account mappings — `accounting.coa.manage`
- **Bank reconciliation** (hard block — whoever disburses must never reconcile) — `accounting.bank.manage`
- Manage bank accounts, close/reopen periods — `accounting.bank.manage`
- Trial balance, financial statements, GL inquiry, dashboard KPIs — `accounting.read`, `accounting.reports`
- **Void or spoil a check** — `accounting.check.void` (see below)

## Void requires a different approver (maker ≠ checker)

Voiding/spoiling a check is destructive (money already committed), so it is **not** a
cashier action. Only the **General Manager** holds `accounting.check.void`, and the service
(`check.service.voidCheck`) additionally rejects the void if the approver is the same user
who **prepared, printed, or released** the check. So even a GM who happened to handle a
particular check cannot void that one — a different approver must. The person who prints is
recorded on the check (`printedBy`); the person who releases is `releasedBy`.

Forward transitions (release, clearing) go through `POST /accounting/checks/:id/transition`;
void/spoil go through the separate, approver-gated `POST /accounting/checks/:id/void`.

## Demo users (password `ChangeMe!2026`)

| Login             | Role            | Purpose                                                       |
| ----------------- | --------------- | ------------------------------------------------------------- |
| `sbwd.cashier`    | CASHIER         | Disburses: assigns check #, prints, records release           |
| `sbwd.gm`         | GENERAL_MANAGER | Dedicated check-void approver                                 |
| `sbwd.accountant` | ACCOUNTANT      | Prepares DVs (records to GL); only _views_ the check register |

## Enforcement & tests

- Gates live at the controller (`@RequirePermissions`) — UI hiding is presentation only.
- `check.service.spec.ts` — the maker ≠ checker rule (printer/preparer/releaser rejected; independent approver allowed) and that `printCheck` records the printer.
- `accounting-route-coverage.spec.ts` — asserts every mutating route in the accounting controllers declares a permission gate (the guard fails _open_ on a missing decorator, so this catches a forgotten gate in CI).
