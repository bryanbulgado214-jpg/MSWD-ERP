# @mswd-erp/api

The MSWD ERP backend — a NestJS + TypeScript + Prisma/PostgreSQL API.
Currently contains only foundational infrastructure: no business modules
(Budgeting, Accounting, Procurement, Inventory, HR) exist yet.

## Folder guide

| Folder                 | Purpose                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `src/modules/`         | Where every future business module lives (currently empty — see its own README). |
| `src/common/`          | Cross-cutting filters/interceptors/guards/decorators shared by all modules.      |
| `src/config/`          | Environment variable validation (Zod).                                           |
| `src/database/`        | Prisma connection wrapper, injected by future modules.                           |
| `prisma/schema.prisma` | Database schema — datasource/generator only for now, no tables yet.              |

## Getting started

```bash
# from the repo root
npm install

cp apps/api/.env.example apps/api/.env
# edit apps/api/.env with a real DATABASE_URL

npm run dev:api
```

The API starts on `http://localhost:3000` (configurable via `PORT`).
`GET /health` returns a basic liveness check — it is infrastructure, not a
business endpoint.

## Adding the first business module

1. Design its Prisma models and add them to `prisma/schema.prisma`.
2. Run `npm run prisma:migrate --workspace=@mswd-erp/api` to create the
   migration.
3. Scaffold the module under `src/modules/<name>/` following the
   convention documented in `src/modules/README.md`.
4. Register the module in `src/app.module.ts`.
