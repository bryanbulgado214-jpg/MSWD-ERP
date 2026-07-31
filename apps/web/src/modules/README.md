# src/modules

Every business-facing feature of the ERP frontend lives here as its own
self-contained module. **This folder is intentionally empty right now** —
no Budgeting, Accounting, Procurement, Inventory, or HR modules have been
built yet.

## Convention for a new module

```
modules/
└── accounting/
    ├── routes.tsx          (exports this module's route objects)
    ├── pages/               (top-level pages/screens for this module)
    ├── components/          (components used only within this module)
    ├── hooks/               (hooks used only within this module)
    └── api.ts               (functions calling this module's API endpoints)
```

Then spread `routes.tsx`'s exported routes into `../app/router.tsx`.

## Rules for modules

- A module may use anything in `../shared/`, but other modules should not
  reach into a module's internals directly — if two modules need to share
  something, promote it to `../shared/` instead.
- Keep a module's API calls inside that module's own `api.ts`, not
  scattered across components.
