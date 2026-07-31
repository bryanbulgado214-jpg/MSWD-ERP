# src/common

Cross-cutting code shared by every business module — never
module-specific business logic.

## Subfolders

- `filters/` — Nest exception filters (e.g. a global filter that turns
  every thrown error into a consistent JSON error response shape).
- `interceptors/` — Nest interceptors (e.g. request logging, response
  shape normalization, timeout handling).
- `guards/` — Nest guards (e.g. authentication/authorization checks
  applied to routes across multiple modules).
- `decorators/` — custom parameter/method decorators (e.g. a
  `@CurrentUser()` decorator once auth exists).

## Rule of thumb

If a piece of code is only useful to one business module, it belongs
inside that module's own folder under `../modules/`, not here. Only put
something in `common/` once at least two unrelated modules need it.
