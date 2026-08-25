-- A JEV line whose GL account is not yet determined (e.g. an "Other" cashier
-- collection). It credits a temporary holding account and must be reclassified
-- to a real account by the accountant before the JEV can be posted.
ALTER TABLE "jev_lines"
  ADD COLUMN "pending_classification" boolean NOT NULL DEFAULT false;

CREATE INDEX "jev_lines_pending_classification_idx"
  ON "jev_lines" ("pending_classification")
  WHERE "pending_classification" = true;
