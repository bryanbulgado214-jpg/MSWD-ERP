-- Whether a payee is VAT-registered. Drives the withholding-tax assistant so
-- the accountant doesn't have to look it up on the payee list.
ALTER TABLE "payees" ADD COLUMN "vat_registered" BOOLEAN NOT NULL DEFAULT false;
