-- A pending check has no number until the cashier assigns one at print time, so
-- the check number must be nullable.
ALTER TABLE "checks" ALTER COLUMN "check_number" DROP NOT NULL;
