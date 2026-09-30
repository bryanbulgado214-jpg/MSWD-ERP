-- Per-quarter quantity schedule for a PPMP item (milestone of activities).
-- Stored as JSON {"1":6,"3":6,"4":6}; when set, its values sum to the item's
-- quantity. Nullable and additive, so existing rows are unaffected.
ALTER TABLE "ppmp_items" ADD COLUMN "schedule_by_quarter" jsonb;
