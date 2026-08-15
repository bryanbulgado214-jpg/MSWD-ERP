-- Checks now originate from Disbursement Vouchers in a PENDING state (before the
-- cashier assigns a number and prints). Added ahead of 'assigned'.
ALTER TYPE "check_status" ADD VALUE IF NOT EXISTS 'pending' BEFORE 'assigned';
