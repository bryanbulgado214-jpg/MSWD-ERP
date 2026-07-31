# src/config

Application-level configuration: environment variable validation and any
future configuration loaders (e.g. per-module feature flags).

## What lives here

- `env.validation.ts` — a Zod schema describing every environment variable
  the API requires, wired into `@nestjs/config` in `app.module.ts`. If a
  required variable is missing or the wrong type, the app refuses to start
  and prints exactly what's wrong, instead of failing unpredictably later.

## Adding a new environment variable

1. Add it to `envSchema` in `env.validation.ts` with the correct type/rules.
2. Add it (with a safe placeholder value) to `.env.example` at the app root.
3. Read it anywhere in the app via Nest's `ConfigService`, never via
   `process.env` directly — that keeps validation and typing consistent.

## Do not

- Do not read `process.env` directly outside this validation layer.
- Do not commit real secrets into `.env.example` — placeholders only.
