# @mswd-erp/web

The MSWD ERP frontend — React + TypeScript + Vite. Currently contains only
foundational shell/routing infrastructure: no business modules (Budgeting,
Accounting, Procurement, Inventory, HR) exist yet.

## Folder guide

| Folder         | Purpose                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| `src/app/`     | Root app shell and central route table (see its own README).                             |
| `src/modules/` | Where every future business feature module lives (currently empty — see its own README). |
| `src/shared/`  | Components/hooks/utils/types reused across two or more modules.                          |
| `src/assets/`  | Static assets (images, icons).                                                           |

## Getting started

```bash
# from the repo root
npm install

cp apps/web/.env.example apps/web/.env
# edit apps/web/.env if the API isn't running on the default URL

npm run dev:web
```

Opens on `http://localhost:5173` by default (Vite's default dev port).

## Adding the first business module

1. Create `src/modules/<name>/` following the convention documented in
   `src/modules/README.md`.
2. Export its routes from `src/modules/<name>/routes.tsx`.
3. Spread those routes into `src/app/router.tsx`.
