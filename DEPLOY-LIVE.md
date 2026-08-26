# AquaBooks — Live Deployment Runbook (Windows + PM2)

A clean, live installation of **Cashiering + Accounting + their Reports** on a
separate server computer. All other modules are blocked. The database starts
empty; the accountant uploads the Chart of Accounts and Trial Balance.

> This never touches your developer/demo machine. The live server uses its own
> empty database (`aquabooks_live`). Keep the demo as-is for development.

Do the steps **in order**, on the **server computer**. Copy‑paste each command.
Open a terminal as **Administrator** (PowerShell or Command Prompt).

---

## Part A — Install the tools (once)

1. **Node.js** (v22 LTS or the same version as dev), **PostgreSQL 18**, **Git** —
   installers from their websites, or:

   ```
   winget install OpenJS.NodeJS Git.Git PostgreSQL.PostgreSQL.18
   ```

   During PostgreSQL setup, **write down the `postgres` password**.

2. **PM2** (keeps the app running + auto-starts on reboot):
   ```
   npm install -g pm2 pm2-windows-startup
   pm2-startup install
   ```

---

## Part B — Create the empty live database (once)

Open **SQL Shell (psql)** (search the Start menu), log in as `postgres`, and run:

```sql
CREATE ROLE aquabooks_live WITH LOGIN PASSWORD 'choose-a-strong-password' CREATEDB;
CREATE DATABASE aquabooks_live OWNER aquabooks_live;
```

Leave it empty. Remember the password you chose.

---

## Part C — Get the code and configure it (once)

3. Clone the project (or copy the folder — but exclude `node_modules`, `.env`,
   and `backups/`):

   ```
   git clone <your-repo-url> C:\AquaBooks
   cd C:\AquaBooks
   npm install
   ```

4. Create the two environment files from the templates in `deploy\`:
   - Copy `deploy\api.env.example` → `apps\api\.env`, then edit it:
     - put the `aquabooks_live` **database password** into `DATABASE_URL`
     - generate and paste a real `JWT_SECRET`:
       ```
       node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
       ```
   - Copy `deploy\web.env.example` → `apps\web\.env` (leave it as `/api`).

---

## Part D — Build the clean live database (once)

Run these from the **apps\api** folder (they use the live database in `.env`):

```
cd C:\AquaBooks\apps\api
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

Then run the **live finalize** — set your water district's name first:

```
$env:LIVE_ORG_NAME="Your Water District Name"
$env:LIVE_ORG_CODE="YWD"
npx ts-node prisma/seed-live.ts
```

This renames the organization, creates the **three logins**
(`admin` / `accountant` / `cashier`, password `ChangeMe!2026`), turns off all
demo logins, blocks every module except Cashiering/Accounting/Reports, and
empties the chart of accounts so the accountant can upload their own.

---

## Part E — Build and start the app under PM2 (once)

```
cd C:\AquaBooks
npm run build --workspace=@mswd-erp/api
npm run build --workspace=@mswd-erp/web
pm2 start ecosystem.config.cjs
pm2 save
```

Open the firewall so client PCs can reach the app (run once, as Administrator):

```
New-NetFirewallRule -DisplayName "AquaBooks 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Any
```

The app is now live at **http://<server-ip>:5173** (find the server IP with
`ipconfig`; ideally reserve a static IP on your router). Client PCs only need a
web browser — nothing to install.

---

## Part F — First-day setup by the accountant (in the browser)

Log in at `http://<server-ip>:5173` as **accountant** (`ChangeMe!2026`), then:

1. **Chart of Accounts** — Accounting → Chart of Accounts → **Import**. Paste/upload
   your COA CSV (see `deploy\coa-template.csv` for the exact columns:
   `accountCode, name, accountType, normalBalance`).
2. **Beginning balances** — Reports → Trial Balance → **Upload opening balances**.
   Use `deploy\trial-balance-template.csv` (`Account Code, Debit, Credit`; debits
   must equal credits). Set the **as‑of date** (your cutover date). This posts one
   opening journal entry.
3. **Wire cashiering to the accounts** — back on the server, from `apps\api`:
   ```
   npx ts-node prisma/ensure-live-mappings.ts
   ```
   (This points the collection types + "Cash - Collecting Officer" at your uploaded
   accounts by their standard UACS codes. Any it can't find, set by hand in
   Accounting → **Account Mappings**.)
4. **Bank accounts** — Accounting → Bank Accounts → add your bank account(s) and
   link each to its GL account (needed so the cashier can record deposits).

Then, as **admin**, add the day-to-day lists the cashier uses: 5. **Collectors & areas** — Billing/Cashiering → Collection Setup → add your teller
names and collection areas.

**Change the three passwords** (admin / accountant / cashier) after first login.

---

## Daily operations

- Status / logs: `pm2 status` `pm2 logs`
- Restart: `pm2 restart all`
- After a reboot, PM2 starts the app automatically (from `pm2 save` + startup).

## Updating to a newer version later (from a developer)

```
cd C:\AquaBooks
git pull
npm install
cd apps\api && npx prisma migrate deploy && npx prisma generate && cd ..\..
npm run build --workspace=@mswd-erp/api
npm run build --workspace=@mswd-erp/web
pm2 restart all
```

Your live data is safe — migrations never delete it, and the demo is a separate
machine/database entirely.
