-- Link each purchase-request LINE to the PPMP item it draws from, so one PR can
-- span several PPMP items and per-item purchased/remaining tracking stays exact.
-- Nullable + SET NULL, additive; existing rows keep the header-level PPMP link.
ALTER TABLE "purchase_request_items" ADD COLUMN "ppmp_item_id" uuid;

ALTER TABLE "purchase_request_items"
  ADD CONSTRAINT "purchase_request_items_ppmp_item_id_fkey"
  FOREIGN KEY ("ppmp_item_id") REFERENCES "ppmp_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "purchase_request_items_ppmp_item_id_idx" ON "purchase_request_items"("ppmp_item_id");
