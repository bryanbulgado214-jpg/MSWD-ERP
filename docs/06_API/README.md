# 06_API

API design and reference documentation for the NestJS backend
(`apps/api`).

## What belongs here

- API design conventions (REST resource naming, error response shape,
  pagination, versioning strategy) once decided.
- Per-module endpoint reference as each module is built (request/response
  shapes, required permissions per endpoint).
- Authentication/authorization flow as it applies to API consumers
  (token handling, session behavior).

## What doesn't belong here

- Generated/auto-produced API documentation output (e.g. an OpenAPI spec
  file) — that belongs alongside the code in `apps/api/`, not here. This
  folder is for hand-written explanation and rationale, not generated
  artifacts.
