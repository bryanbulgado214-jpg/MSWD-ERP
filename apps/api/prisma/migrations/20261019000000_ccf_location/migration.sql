-- CCF gains an optional Location (the complaint's address/area), so a work order
-- linked to the CCF can auto-capture its location (and customer/account).
ALTER TABLE "customer_concerns" ADD COLUMN IF NOT EXISTS "location" VARCHAR(255);
