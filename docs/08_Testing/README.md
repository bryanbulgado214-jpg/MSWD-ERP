# 08_Testing

Test strategy, plans, and QA documentation.

## What belongs here

- Overall test strategy (unit/integration/end-to-end split, coverage
  expectations).
- Per-module test plans, especially for high-risk logic (e.g. budget
  concurrency control, check lifecycle, approval workflows) where
  correctness matters more than typical CRUD screens.
- Manual QA checklists/UAT scripts.
- Known issues / regression tracking notes, if not tracked in a separate
  issue tracker.

## What doesn't belong here

- Actual test code — that lives alongside the source it tests in
  `apps/api/` or `apps/web/`.
