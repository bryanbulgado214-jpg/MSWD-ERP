-- APP items can carry an expense-class hint (CAPEX → asset/infrastructure,
-- MOOE → expense) so a PR raised from a direct APP line defaults to the right
-- classification and account. Uses the existing item_classification enum.
ALTER TABLE "app_items" ADD COLUMN IF NOT EXISTS "classification" "item_classification";
