-- Track who printed a check so a check void can enforce maker != checker
-- (the person who assigned the number / printed / released the check must not
-- be the one who voids it). Only a dedicated approver may void.
ALTER TABLE "checks" ADD COLUMN "printed_by" UUID;
ALTER TABLE "checks" ADD COLUMN "printed_at" TIMESTAMPTZ(6);
