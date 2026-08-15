-- Accounting: add the `approved` status to journal_entry_vouchers.
--
-- Introduces a distinct review/approval stage between "For Review" and
-- "Posted", giving a three-person separation of duties:
--   draft -> for_review (Preparer submits)
--          -> approved   (Reviewer approves)   [new]
--          -> posted     (Poster posts)
-- Posting still also accepts a for_review entry directly (the approval stage
-- is optional / backward-compatible). No new columns are needed — the
-- approver is recorded in the existing reviewed_by / reviewed_at fields.
--
-- Enum value additions live in their own migration (nothing else in this
-- file uses the value), consistent with the project's enum-change convention.

ALTER TYPE "jev_status" ADD VALUE IF NOT EXISTS 'approved';
