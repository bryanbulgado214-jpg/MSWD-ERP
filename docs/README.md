# MSWD ERP — Documentation

Project documentation, organized by concern rather than by module — each
folder below holds a specific kind of document, regardless of which
business module (Budgeting, Accounting, Procurement, Inventory, HR) it
relates to. This keeps documentation easy to find as the ERP grows to
cover more modules, instead of duplicating the same folder structure once
per module.

| Folder | Contents |
|---|---|
| `01_Vision/` | Why this project exists — goals, scope, stakeholders. |
| `02_Requirements/` | What the system must do — functional and non-functional requirements per module. |
| `03_Architecture/` | How the system is built — application, integration, and infrastructure architecture. |
| `04_Database/` | Database design — schema architecture, ERDs, naming standards. |
| `05_Workflows/` | Business process and approval-workflow definitions. |
| `06_API/` | API design and reference documentation. |
| `07_UI_UX/` | UI/UX guidelines, wireframes, and design decisions. |
| `08_Testing/` | Test plans, strategy, and QA documentation. |
| `09_Deployment/` | Deployment, environment, and operations documentation. |
| `10_Decisions/` | Architecture Decision Records (ADRs) — a dated log of significant decisions and their rationale. |
| `Archive/` | Superseded documents kept for historical reference, not current guidance. |

Each folder has its own `README.md` with more detail on what belongs
there. This top-level structure is documentation only — no application
code, migrations, or business features live under `docs/`.
