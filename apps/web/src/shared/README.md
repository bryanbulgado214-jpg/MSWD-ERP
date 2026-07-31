# src/shared

Code reused by two or more business modules — never module-specific
business logic, and never business logic at all before at least one real
module exists to justify sharing it.

## Subfolders

- `components/` — presentational/UI components used across modules (e.g.
  a `<DataTable />`, `<PageHeader />`, form inputs).
- `hooks/` — reusable React hooks not tied to one module (e.g. a future
  `useAuth()`, `usePagination()`).
- `utils/` — plain TypeScript helper functions (formatting, validation
  helpers, etc.) with no React dependency.
- `types/` — shared TypeScript types/interfaces used across modules.

## Rule of thumb

If something is only used by one module, keep it inside that module's
folder under `../modules/`. Only move it here once a second module
genuinely needs the same thing — avoids building a "shared" layer nobody
actually shares yet.
