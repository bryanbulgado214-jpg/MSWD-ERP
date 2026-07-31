# MSWD ERP

A modular, web-based Enterprise Resource Planning system, built to grow
into multiple business modules (Budgeting, Accounting, Procurement,
Inventory, HR, and more) over time — without those modules stepping on
each other's toes.

**Current status:** project foundation only. No business modules have
been built yet. This repository contains the tooling, structure, and
conventions everything else will be built on top of.

## Tech stack

| Layer          | Choice                                                      |
| -------------- | ----------------------------------------------------------- |
| Backend        | NestJS + TypeScript                                         |
| Frontend       | React + Vite + TypeScript                                   |
| Database       | PostgreSQL + Prisma ORM                                     |
| Monorepo       | npm workspaces                                              |
| Linting        | ESLint (flat config) + typescript-eslint                    |
| Formatting     | Prettier                                                    |
| Git hooks      | Husky + lint-staged                                         |
| Env validation | Zod (backend), Vite's built-in `import.meta.env` (frontend) |

See each app's own README for the reasoning behind its specific choices.

## Project layout

```
MSWD-ERP/
├── apps/
│   ├── api/     NestJS backend — see apps/api/README.md
│   └── web/     React frontend — see apps/web/README.md
├── packages/
│   └── config/  Shared TypeScript base config — see packages/config/README.md
├── eslint.config.js       Shared lint rules for the whole repo
├── .prettierrc.json       Shared formatting rules for the whole repo
└── .husky/pre-commit      Runs lint-staged before every commit
```

Every folder that matters has its own `README.md` explaining what belongs
there and what doesn't — start with the app you're working in.

## Prerequisites

- Node.js 20+
- A running PostgreSQL instance (for the API — not required just to run
  the frontend or to lint/typecheck/build everything)

## First-time setup

```bash
npm install

cp apps/api/.env.example apps/api/.env   # then edit DATABASE_URL
cp apps/web/.env.example apps/web/.env   # defaults are fine for local dev

npm run dev:api   # http://localhost:3000
npm run dev:web   # http://localhost:5173
```

## Common commands (run from the repo root)

| Command                | What it does                            |
| ---------------------- | --------------------------------------- |
| `npm run dev:api`      | Start the backend in watch mode         |
| `npm run dev:web`      | Start the frontend dev server           |
| `npm run build`        | Build every app                         |
| `npm run typecheck`    | Type-check every app, no emit           |
| `npm run lint`         | Lint the whole repo                     |
| `npm run lint:fix`     | Lint and auto-fix the whole repo        |
| `npm run format`       | Format the whole repo with Prettier     |
| `npm run format:check` | Check formatting without changing files |

A pre-commit hook (Husky + lint-staged) automatically lints and formats
whatever you've staged before every commit — you shouldn't normally need
to run lint/format manually before committing.

## Adding the first business module

This foundation deliberately ships with **zero** business modules. When
it's time to build the first one (e.g. Accounting):

1. **Design its data model** and add the corresponding models to
   `apps/api/prisma/schema.prisma`.
2. **Create the migration:**
   `npm run prisma:migrate --workspace=@mswd-erp/api`
3. **Scaffold the backend module** under `apps/api/src/modules/<name>/`
   following the convention in that folder's `README.md`, then register
   it in `apps/api/src/app.module.ts`.
4. **Scaffold the frontend module** under `apps/web/src/modules/<name>/`
   following the convention in that folder's `README.md`, then spread its
   routes into `apps/web/src/app/router.tsx`.

Each module should be self-contained and independently removable — if two
modules start feeling tightly coupled, that's a sign a boundary is in the
wrong place, not a reason to merge them.
