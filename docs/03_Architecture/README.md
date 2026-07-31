# 03_Architecture

How the system is built, at the application and infrastructure level —
distinct from the database's own internal design, which has its own
folder (`04_Database/`) given how central and detailed it is for an ERP.

## What belongs here

- Technology stack rationale (why NestJS, why React/Vite, why Prisma,
  why PostgreSQL, why a monorepo).
- Monorepo/module structure conventions (how `apps/api/src/modules/` and
  `apps/web/src/modules/` are organized, and the rules for what belongs
  in a module vs. `common`/`shared`).
- Cross-module integration patterns (e.g. the polymorphic
  attachments/workflow/audit-log design shared by every module).
- Security architecture (authentication, authorization/RBAC design,
  session handling).
- System diagrams showing how the API, web app, and database relate.

## What doesn't belong here

- Database table-level design — see `04_Database/`.
- One-off significant decisions with a specific date and rationale — see
  `10_Decisions/` (an ADR referencing a change here is fine; the ADR
  itself lives there).
