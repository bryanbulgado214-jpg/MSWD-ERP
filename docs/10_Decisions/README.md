# 10_Decisions

Architecture Decision Records (ADRs) — a dated, permanent log of
significant decisions and the reasoning behind them, so future
contributors understand *why* something was built a certain way, not
just what it currently looks like.

## What belongs here

One short file per significant decision, e.g.:
`0001-use-nestjs-modular-monolith.md`,
`0002-hard-budget-enforcement-mechanism.md`,
`0003-check-registry-legacy-import-strategy.md`.

Each ADR should briefly cover: the context/problem, the decision made,
and the consequences/trade-offs accepted.

## What makes something ADR-worthy

Not every choice needs a record — only decisions that were genuinely
debated, that a reasonable person might have made differently, or that
future work depends on understanding (e.g. "why is currency_id on every
transactional table if we only support PHP?" is exactly the kind of
question an ADR should answer before someone "simplifies" it away).

## What doesn't belong here

- ADRs are never edited to reflect a later reversal — if a decision is
  later changed, write a **new** ADR that supersedes the old one and
  says so explicitly. The old ADR stays as-is; do not move it to
  `../Archive/` — a superseded ADR is still part of the decision history,
  not an obsolete document.
