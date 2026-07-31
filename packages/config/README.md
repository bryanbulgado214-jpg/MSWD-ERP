# @mswd-erp/config

Shared configuration consumed by every app and package in the monorepo, so
compiler and linting rules never drift between `apps/api`, `apps/web`, or
future packages.

## What lives here

- `tsconfig.base.json` — the single source of truth for TypeScript compiler
  options (strictness flags, target, module resolution). Every app's own
  `tsconfig.json` extends this file and only overrides what it genuinely
  needs to (e.g. `jsx` settings for the frontend, `experimentalDecorators`
  for the NestJS backend).

## Why this exists

In a large ERP, dozens of business modules will eventually be added across
both the API and the web app. Without a shared base config, TypeScript
strictness and linting behavior would slowly diverge between modules
written at different times by different people. Centralizing it here means
tightening a rule once (e.g. enabling a new strict flag) automatically
applies everywhere.

## Do not

- Do not put app-specific settings here (e.g. React JSX options, NestJS
  decorator flags) — those belong in each app's own `tsconfig.json`.
- Do not add business logic here — this package is configuration only.
