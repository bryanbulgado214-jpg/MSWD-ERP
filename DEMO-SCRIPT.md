# WDAFMS — Demo Script (Accounting Core)

**Water District Accounting and Financial Management System** — demo walkthrough for
executives, accountants, budget officers, and GMs of Philippine Local Water Districts.

> **Positioning line (use verbatim):** _"This system is designed to support applicable
> COA, LWUA, and Philippine government accounting requirements."_
> Do **not** claim it is "COA/LWUA/BIR approved" or "certified" — it is not, and saying so
> would be inaccurate.

Everything shown is real double-entry accounting: a JEV cannot post unless total debits
equal total credits (enforced in the database transaction, not just the screen), posted
entries are immutable and corrected only by linked reversals, and **every report figure is
computed live from posted journal-entry lines** — there are no hard-coded totals or fake
charts anywhere.

The demo organization is a fictional **Sta. Barbara Water District**. A banner reading
**"DEMONSTRATION DATA — NOT ACTUAL WATER DISTRICT RECORDS"** is shown at all times.

---

Project location: **`C:\Users\Lenovo\Desktop\Accounting System`** (the path has spaces —
quote it in commands). For the **multi-device (2–3 laptops on one LAN)** setup, follow
**DEMO-NETWORK.md** first; this script covers the walkthrough itself.

## 1. Pre-demo checklist (do this ~10 minutes before)

1. **PostgreSQL** is running locally (service `postgresql-x64-18`, port 5432).
2. **Free port 3000** on the server laptop — if another dev server is using it (e.g. a
   Next.js app), stop it first (`netstat -ano | findstr :3000`).
3. **Reset the demo data to a pristine state** (wipes & rebuilds only Sta. Barbara's JEVs; never touches other data):
   ```bash
   cd "C:\Users\Lenovo\Desktop\Accounting System\apps\api"
   npm run seed:demo
   ```
   Expected tail: `Posted JEVs: 72 (198 lines) across Jan–Jun 2026`.
4. **Start the API** (binds `0.0.0.0:3000` — LAN-reachable):
   ```bash
   cd "C:\Users\Lenovo\Desktop\Accounting System"
   npm run dev:api
   ```
   Wait for `API listening on http://0.0.0.0:3000 …`.
5. **Start the web app** (Vite, binds `0.0.0.0:5173`):
   ```bash
   cd "C:\Users\Lenovo\Desktop\Accounting System"
   npm run dev:web
   ```
6. **For multi-device:** confirm the server IP with `ipconfig`, set it in
   `apps\web\.env` (`VITE_API_BASE_URL=http://<server-ip>:3000`), restart Vite, and confirm
   each client laptop can open `http://<server-ip>:5173`. **See DEMO-NETWORK.md.**
7. Open **http://localhost:5173/** and confirm you can log in.
8. **Pre-login each role on its laptop** before the audience arrives (see the logins below).

**Single-laptop logins** (all password **`ChangeMe!2026`**) — use **"Switch User"** to move between them:

| Username          | Role               | Use in the demo                                     |
| ----------------- | ------------------ | --------------------------------------------------- |
| `sbwd.accountant` | Accountant         | Prepares & submits JEVs, views ledgers/statements   |
| `sbwd.approver`   | Accountant         | Reviews, **posts**, reverses (separation of duties) |
| `sbwd.admin`      | Administrator / GM | Views the Audit Trail, full oversight               |

**Multi-device workflow logins** (all password **`demo1234`**) — one role per laptop:

| Username   | Laptop   | Can do (server-enforced)                                             |
| ---------- | -------- | -------------------------------------------------------------------- |
| `preparer` | Laptop 1 | Create + submit only — **403** if they try to approve or post        |
| `reviewer` | Laptop 2 | Approve only — **403** if they try to create or post                 |
| `poster`   | Laptop 3 | Approve + **post** & reverse — **cannot post an entry they created** |

---

## 1b. Multi-device flow (2–3 laptops) — separation of duties, live

> Setup is in **DEMO-NETWORK.md**. Each laptop is pre-logged-in as its role. If you only
> have 2 laptops, put `reviewer` and `poster` on the same one, or skip the approve step
> (a `for_review` JEV can be posted directly by `poster`).

1. **Laptop 1 — `preparer`:** Accounting → Journal Entries → **+ New JEV**. Add two lines,
   e.g. **Dr Cash in Bank 50,000 / Cr Water Sales Revenue 50,000**. Show the live
   **Total Debit / Total Credit / Difference** and the **"Balanced"** flag; "Create JEV" is
   disabled until it balances. **Create JEV** (Draft) → **Submit for Review**.
   - Try to click nothing else exists — the preparer has **no** Approve or Post button.
     (If they hit the API directly, the server returns **403**.)
2. **Laptop 2 — `reviewer`:** Accounting → Journal Entries → open that JEV (status
   _For Review_). The reviewer sees an **Approve JEV** button (no Post button). Click
   **Approve JEV** → status becomes **Approved**. _"A different person reviews and approves —
   the preparer cannot approve their own entry."_
3. **Laptop 3 — `poster`:** open the same JEV (now _Approved_). The poster sees **Post JEV**
   (and later **Reverse**). Click **Post JEV** → **Posted**, numbered `JEV-2026-0000NN`.
   _"A third person commits it. The system blocks anyone from posting an entry they
   created — separation of duties, enforced server-side."_
4. **Everyone watches it flow through:** on any laptop go to **Trial Balance** (still
   **Balanced**) and **Financial Statements** (SFP **A = L + E**, and the new entry shows in
   Revenue/Assets). Refresh the **Dashboard** — the counts moved (For Review → Approved →
   Posted).
5. **Correction, live:** on `poster`, open a posted JEV → **Reverse JEV** → a linked
   equal-and-opposite entry is posted, the original is marked **Reversed**, and the Trial
   Balance stays balanced (net zero). Nothing is deleted.
6. **Audit:** on the `sbwd.admin` laptop → **Admin → Audit Trail**, filter by module
   _Accounting_ — every create/approve/post/reverse is attributed to the exact user and
   time. _"Show the auditor precisely who did what, and when."_

**Talking point:** three people, three laptops, three permissions — the system enforces the
separation, not an honor system. The numbers on every screen are the same shared database,
updating live for everyone.

---

### Single-laptop fallback (if the network fails)

Run everything on **one laptop** and present from it — no other devices needed:

1. In `apps\web\.env` set `VITE_API_BASE_URL=http://localhost:3000` (or delete the file),
   and restart Vite.
2. Do the same create → submit → approve → post flow, using **"Switch User"** to move
   between `preparer` → `reviewer` → `poster` (password `demo1234`) on the one screen — or
   use `sbwd.accountant` (prepare) and `sbwd.approver` (post) with `ChangeMe!2026`.
   The story is identical; only the number of screens changes.

---

## 2. The 15-minute walkthrough

### (1) Landing & Dashboard — _"real numbers, live"_ (~2 min)

- Log in as **`sbwd.accountant`**. Point out the demo banner and the district name in the header.
- Go to **Accounting → Dashboard**. Every card is computed from posted GL right now:
  - Cash & Cash Equivalents ≈ **₱4.67M**, Receivables ≈ **₱1.50M**, Total Assets ≈ **₱17.77M**
  - Revenue YTD ≈ **₱5.23M**, Expenses YTD ≈ **₱3.28M**, **Net Surplus ≈ ₱1.96M**
  - JEV workflow counts (Posted 72, Pending 0, …)
- Note the **"Coming in Phase 2"** roadmap cards at the bottom — an honest view of what is _not_ yet built (AR subledger, AP/DV register, cashiering/RCD, loans, PPE→GL, period close).

### (2) Chart of Accounts + CSV import (~2 min)

- **Accounting → Chart of Accounts**: a clean sample chart on the standard class structure
  (1 Assets, 2 Liabilities, 3 Equity, 4 Income, 5 Expenses), header vs. postable accounts.
- Show **Import CSV** → _validate → preview → confirm_. Explain: this is how a real
  Modified CPS-RCA chart gets loaded later; the preview flags row-level errors before anything
  is written. (You can download the template and show the preview without confirming.)

### (3) Create and post a balanced JEV — _the core_ (~3 min)

- **Accounting → Journal Entries → + New JEV** (as `sbwd.accountant`).
- Add two lines, e.g. **Dr Cash in Bank ₱50,000 / Cr Water Sales Revenue ₱50,000**.
  - Watch the live **Total Debit / Total Credit / Difference** and the **"Balanced"** indicator.
  - Deliberately unbalance it first (change one amount) — **"Create JEV" is disabled** and the
    difference is shown. Fix it, then **Create JEV** (saves as **Draft**).
- Click **Submit for Review** → status becomes **For Review**.

### (4) Separation of duties (~1 min)

- Still as `sbwd.accountant`, click **Post JEV** → **blocked**:
  _"The preparer of a JEV cannot post it… (separation of duties)."_ This is enforced server-side.
- **Switch User → `sbwd.approver`**, open the same JEV, click **Post JEV** → status **Posted**,
  numbered **`JEV-2026-0000NN`**.

### (5) Watch the ledgers & statements update (~2 min)

- **Trial Balance** (Accounting → Trial Balance): totals show **Debits = Credits (Balanced)**.
- **Financial Statements**:
  - **Statement of Financial Position** → **"Assets = Liabilities + Equity (Balanced)"**.
  - Toggle **Statement of Financial Performance** → Revenue − Expenses = Net Surplus.

### (6) Drill-down — _"every number traces to source"_ (the centerpiece) (~2 min)

- On the **Statement of Financial Position**, click a figure (e.g. **Water Sales Revenue**) →
  opens its **Subsidiary Ledger** (all posting lines for that account).
- Click any **JEV number** in the ledger → the **JEV detail** (header + balanced lines).
- Chain shown end-to-end: **Financial Statement figure → account ledger → JEV → (audit history)**.

### (7) Reversal — _immutability done right_ (~2 min)

- On a **Posted** JEV, click **Reverse JEV**, add a reason, **Post Reversing Entry**.
- A new linked JEV is posted with **debits and credits swapped**; the original is marked
  **Reversed** and shows a banner linking to its reversal (and vice-versa). Nothing is deleted.
- Return to **Trial Balance** — still **Balanced**; the reversal nets the entry to zero while
  keeping both records for audit.

### (8) Audit Trail — _"who did what, when"_ (~2 min)

- **Switch User → `sbwd.admin`** → **Admin → Audit Trail**.
- Filter by **module = Accounting** and by **user** — every create/post/reverse is attributed to
  the actual user (e.g. `sbwd.accountant` created, `sbwd.approver` posted) with a timestamp and
  the changed fields. It's written automatically by a database trigger and is read-only.
- Tip: from any JEV detail (as admin) you can click **"View audit history"** to jump straight to
  that record's trail.

### (9) Budget module tour — _breadth_ (~1 min)

- **Budgeting**: show the approved **FY2026 Budget Cycle** → Finance & Administrative Services /
  General Fund, **₱6.4M**, with account-level lines and a release. This full budgeting module
  (cycles → versions → approval → releases → reservations → availability → reports) was built and
  audited earlier and lives in the same platform.

---

## 3. Reset between runs

To wipe the JEVs you created during a demo and restore the clean 72-entry baseline:

```bash
cd "C:\Users\Lenovo\Desktop\Accounting System\apps\api" && npm run seed:demo
```

It is idempotent and only affects **Sta. Barbara Water District** — other data is untouched.

---

## 4. If asked — honest answers to likely questions

- **"Is this COA/LWUA/BIR certified?"** No. It is _designed to support_ those requirements; the
  seeded chart is a clearly-labeled sample, and a real Modified CPS-RCA chart can be imported via CSV.
- **"Are the numbers real?"** They are internally consistent demonstration data. Every statement is
  computed from the posted journal entries you can see — reversing a demo JEV visibly changes the
  ledgers, proving nothing is hard-coded.
- **"Can a posted entry be edited or deleted?"** No — it is immutable. Corrections are made with a
  linked reversing entry. (The "Void" action exists only for Draft / For-Review entries.)
- **"How does approval work?"** Draft → For Review (preparer) → Posted (a _different_ user). The
  preparer cannot post their own entry.

---

## 5. Open items / known limitations (Phase-2 backlog — disclose if relevant)

- **Contra-asset presentation.** The Financial Statements sum each account by its normal side and
  by account type, without special contra-account handling. To keep the balance sheet tying out
  exactly, the demo chart carries **PPE at net book value and runs no depreciation** (depreciation
  is a Phase-2 item). A proper _Accumulated Depreciation (contra-asset)_ presentation is Phase 2.
- **District profile.** The district **name** is configurable (it's the organization record, shown
  dynamically across the statements and header). A settings screen for **address/logo** is Phase 2.
- **Document numbering.** JEVs use `JEV-{year}-{000000}` from a per-organization sequence
  (`document_sequences`, prefix configurable in data). A numbering-configuration screen is Phase 2.
- **Prior-period comparatives / variance** on the statements are Phase 2 (current-period statements
  are complete and correct).
- **Out of scope this phase** (shown grayed on the dashboard roadmap): AR subledger, AP/Disbursement
  Voucher register, Cashiering & Report of Collections (RCD), Loans & Amortization, PPE Depreciation
  → GL integration, Period-End Closing engine.
- **Pre-existing (unrelated to this demo):** the Procurement `purchase-request` module has a
  schema-drift issue (`purchase_requests.remarks` column expected by the client but not created by a
  migration) that fails its own tests. Procurement is out of scope for this accounting demo; don't
  navigate into Purchase Request creation during the walkthrough.
- **Run the demo on the dev server** (`npm run dev:web`), which is what the checklist above uses.
  The strict production build (`npm run build` → `tsc -b`) currently reports ~33 pre-existing
  TypeScript strictness errors spread across many older modules (procurement, HR, inventory,
  billing, and some pre-existing accounting/admin pages) — a condition that predates this accounting
  work. It does not affect the Vite dev server or the demo. Cleaning those up is a separate
  housekeeping task.

---

## 6. What was verified

- App builds and boots from `C:\Users\Lenovo\Desktop\Accounting System`; API on `:3000`
  (bound to `0.0.0.0` for the LAN), web on `:5173` (Vite `--host`); login + `/auth/me` working.
- Multi-device: three role-scoped users (`preparer`/`reviewer`/`poster`, `demo1234`) with the
  create→submit→approve→post separation verified **server-side** (preparer/reviewer get 403 on
  post; nobody can post an entry they created).
- Demo data ties out through the live API: **Trial Balance debits = credits = ₱30,514,210**;
  **SFP Assets ₱17,772,650 = Liabilities + Equity + Net Surplus**.
- JEV lifecycle, **separation of duties** (403 when preparer posts), and **reversal** (exact
  opposite entry, original → reversed, ledgers stay balanced) verified end-to-end and by an
  automated test suite (`jev.service.spec.ts`, `gl.service.spec.ts`,
  `financial-statements.service.spec.ts`, all green), alongside the pre-existing 22 budgeting tests.
