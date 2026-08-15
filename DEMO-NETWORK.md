# AquaBooks — Multi-Device LAN Demo Setup

Run the demo across 2–3 laptops on one Wi-Fi/LAN: **one server laptop** runs the API,
the database, and the web app; the **client laptops** just open a browser. All the
accounting work is real double-entry; the server laptop holds the single shared database
that every client reads and writes.

Project location (server laptop): **`C:\Users\Lenovo\Desktop\Accounting System`**
(the path has spaces — quote it in any command).

```
  Client laptop  ┐
  Client laptop  ┼──  Wi-Fi / LAN  ──►  SERVER laptop
  Client laptop  ┘                       ├─ API   (NestJS)  0.0.0.0:3000
                                          ├─ Web   (Vite)    0.0.0.0:5173
                                          └─ PostgreSQL      localhost:5432
```

---

## A. One-time prerequisites (server laptop)

1. PostgreSQL 18 is installed and running (service `postgresql-x64-18`), with the
   `mswd_erp` database already created and seeded.
2. Node.js is installed. Dependencies are installed at the project root
   (`npm install` has been run in `C:\Users\Lenovo\Desktop\Accounting System`).
3. **Free port 3000.** The API uses port 3000. If another app is using it (for example a
   separate Next.js/`AI Builders Lab` dev server), stop that app first, or the API will
   fail to start with `EADDRINUSE`. Check with:
   ```bash
   netstat -ano | findstr :3000
   ```
4. **Open the Windows Firewall** for the two ports so client laptops can connect. Open
   **PowerShell as Administrator** and run once:
   ```powershell
   netsh advfirewall firewall add rule name="AquaBooks API 3000" dir=in action=allow protocol=TCP localport=3000
   netsh advfirewall firewall add rule name="AquaBooks Web 5173" dir=in action=allow protocol=TCP localport=5173
   ```
   (Alternatively, when you first start the servers, Windows may pop up a "Allow access"
   prompt — tick **Private networks** and allow it.)

---

## B. Find the server laptop's IP address

On the **server laptop**, run:

```bash
ipconfig
```

Read the **IPv4 Address** of the _active_ adapter — the Wi-Fi or Ethernet you're demoing
on (e.g. `Wireless LAN adapter Wi-Fi`). Ignore `VMware`/`VirtualBox`/`vEthernet` adapters
and any `169.254.x.x` address.

> On this machine right now it is **`192.168.106.57`** (Wi-Fi). It is a DHCP address and
> **can change** between sessions — always re-check with `ipconfig` on demo day.

---

## C. Point the web app at the server IP

Edit **`C:\Users\Lenovo\Desktop\Accounting System\apps\web\.env`** and set the line to the
server IP from step B, keeping port **3000**:

```
VITE_API_BASE_URL="http://192.168.106.57:3000"
```

> Client browsers download the app from the server and then call this URL for data, so it
> **must** be the server's LAN IP, not `localhost`. **After editing `.env`, restart the
> Vite server** (step D) — Vite only reads `.env` at startup.

---

## D. Start the servers (server laptop)

Open **two terminals** at the project root `C:\Users\Lenovo\Desktop\Accounting System`.

Terminal 1 — API (binds to `0.0.0.0:3000`, reachable on the LAN):

```bash
npm run dev:api
```

Wait for: `API listening on http://0.0.0.0:3000 …`

Terminal 2 — Web (Vite, binds to `0.0.0.0:5173`):

```bash
npm run dev:web
```

Vite prints a **Network:** URL like `http://192.168.106.57:5173/` — that's the address the
clients use.

---

## E. Confirm every laptop can reach the server

1. On the **server**, open `http://localhost:5173/` — you should get the login page.
2. On each **client laptop** (same Wi-Fi), open a browser to:
   ```
   http://192.168.106.57:5173
   ```
   (substitute the server IP from step B). You should see the AquaBooks login.
3. If a client can't load it, from that client run `ping 192.168.106.57`. If ping fails →
   they're on a different network/VLAN or client isolation is on (see Troubleshooting).
   If ping works but the page doesn't load → the server firewall is still blocking the
   ports (redo step A.4).

---

## F. Reset the demo data to a clean baseline (server laptop)

Do this right before the demo (and to clean up between run-throughs). It rebuilds only
Sta. Barbara's data and never touches anything else:

```bash
cd "C:\Users\Lenovo\Desktop\Accounting System\apps\api"
npm run seed:demo
```

Expected tail: `Posted JEVs: 72 (198 lines) across Jan–Jun 2026`.

---

## G. Demo logins

| Username     | Password        | Can do                                                 | Use on   |
| ------------ | --------------- | ------------------------------------------------------ | -------- |
| `preparer`   | `demo1234`      | Create + submit JEVs (**cannot** approve/post)         | Laptop 1 |
| `reviewer`   | `demo1234`      | Approve JEVs (**cannot** create/post)                  | Laptop 2 |
| `poster`     | `demo1234`      | Approve+post & reverse (**cannot** post its own entry) | Laptop 3 |
| `sbwd.admin` | `ChangeMe!2026` | Full oversight + Audit Trail                           | any      |

(The single-laptop demo users `sbwd.accountant` / `sbwd.approver` / `ChangeMe!2026` still
work too.)

The workflow walkthrough is in **DEMO-SCRIPT.md** → "Multi-device flow".

---

## H. Troubleshooting

- **API won't start, `EADDRINUSE: :3000`** — another app holds port 3000. Stop it
  (`netstat -ano | findstr :3000` → note the PID → `taskkill /F /PID <pid>`), then retry.
- **Client can't reach the site** — (a) server firewall not opened (step A.4);
  (b) client on a different network (guest Wi-Fi/hotspot) — put all laptops on the _same_
  SSID; (c) "AP/client isolation" enabled on the router — use a phone hotspot or a switch
  instead; (d) wrong IP — re-run `ipconfig` and re-check `apps/web/.env`.
- **Login works but data calls fail on clients** — `apps/web/.env` still points at
  `localhost` or a stale IP. Fix it and **restart Vite**.
- **Server IP changed** — DHCP reassigned it. Update `apps/web/.env` and restart Vite;
  tell clients the new `:5173` URL.
- **Everything red / network flaky at the venue** — use the **single-laptop fallback** in
  DEMO-SCRIPT.md (run and present entirely on the server laptop; no other devices needed).
