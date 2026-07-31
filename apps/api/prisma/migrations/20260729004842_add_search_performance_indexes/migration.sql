-- Migration: add_search_performance_indexes
--
-- Pure performance improvement, no behavior change. From the Budgeting
-- Phase 1 review: BudgetHeaderService.findAllPaginated's `search` param
-- runs `ILIKE '%term%'` against responsibility_centers.name and
-- fund_sources.name, neither of which had any index supporting it —
-- confirmed via EXPLAIN that both were full sequential scans. Harmless
-- at today's table sizes; won't scale.
--
-- A leading-wildcard ILIKE can't use a plain b-tree index, so this adds
-- pg_trgm (trigram) GIN indexes instead, which DO support
-- `ILIKE '%term%'` efficiently.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_responsibility_centers_name_trgm
  ON responsibility_centers USING gin (name gin_trgm_ops);

CREATE INDEX idx_fund_sources_name_trgm
  ON fund_sources USING gin (name gin_trgm_ops);
