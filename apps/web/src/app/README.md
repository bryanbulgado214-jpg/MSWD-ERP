# src/app

The application shell: the root `<App />` component and the central route
table. This is infrastructure, not a business module.

## What lives here

- `App.tsx` — the root component; wires up the router (and, later, global
  providers such as auth context, theming, or a query client).
- `router.tsx` — the single source of truth for top-level routes. Business
  modules will export their own route arrays (e.g.
  `src/modules/accounting/routes.tsx`) which get spread in here — this
  file should never contain business-specific route _logic_, only the
  composition of routes from each module.
- `HomePage.tsx` — a temporary placeholder landing page, to be replaced by
  a real dashboard/shell once modules exist.

## Do not

- Do not put business UI here — a module's pages/components belong under
  `src/modules/<module-name>/`.
- Do not import from a specific module's internals here beyond its
  exported route array — keeps this file stable as modules come and go.
