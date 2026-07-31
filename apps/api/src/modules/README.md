# src/modules

Every business capability of the ERP lives here as its own self-contained
NestJS module. **This folder is intentionally empty right now** — no
Budgeting, Accounting, Procurement, Inventory, or HR modules have been
built yet. This file documents the convention so every future module is
structured consistently.

## Convention for a new module

When a module (e.g. `accounting`) is built, it should look like:

```
modules/
└── accounting/
    ├── accounting.module.ts
    ├── accounting.controller.ts
    ├── accounting.service.ts
    ├── dto/
    │   ├── create-account.dto.ts
    │   └── update-account.dto.ts
    ├── entities/            (if not solely relying on Prisma types)
    └── accounting.module.md  (short doc: what this module owns, its
                                permissions, its main use cases)
```

Then register it in `../app.module.ts`'s `imports` array.

## Rules for modules

- A module owns its own controllers/services/DTOs. It may depend on
  shared code in `../common/` and the database via `PrismaService`, but
  should **not** reach directly into another business module's internals
  — cross-module communication goes through that module's exported
  service, injected normally through Nest's DI.
- Prisma models for a module are added to `../../prisma/schema.prisma`
  when that module is designed — not before.
- Each module should be deletable/disable-able without breaking unrelated
  modules. If two modules feel tightly coupled, that's a sign the
  boundary is in the wrong place.
