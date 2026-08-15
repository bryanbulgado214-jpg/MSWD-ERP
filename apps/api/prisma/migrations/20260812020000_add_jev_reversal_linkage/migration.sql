-- Accounting: link a reversal JEV to the posted JEV it reverses.
--
-- Posted journal entries are immutable; corrections are made by posting a
-- linked REVERSING entry (equal-and-opposite lines) rather than editing or
-- hard-deleting the original. `reversal_of_id` on the reversing entry points
-- at the original it reverses. The UNIQUE index makes the relationship
-- one-to-one (an entry can be reversed at most once); multiple NULLs are
-- allowed, so ordinary non-reversing entries are unaffected. The original
-- entry's back-reference (which reversal reversed it) is derived from this
-- same column by Prisma — no second column needed.

ALTER TABLE "journal_entry_vouchers" ADD COLUMN "reversal_of_id" UUID;

ALTER TABLE "journal_entry_vouchers"
    ADD CONSTRAINT "journal_entry_vouchers_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entry_vouchers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "journal_entry_vouchers_reversal_of_id_key"
    ON "journal_entry_vouchers"("reversal_of_id");
