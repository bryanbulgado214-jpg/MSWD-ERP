-- Purchase requests: record the end-user who initiated the request.
-- The purchase officer prepares the PR (created_by); requested_by_id captures
-- the end-user on whose behalf it was raised, so it appears on the printed PR
-- even for a manually-entered request with no linked PPMP item.

ALTER TABLE "purchase_requests" ADD COLUMN "requested_by_id" uuid;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "purchase_requests_requested_by_id_idx"
  ON "purchase_requests"("requested_by_id");
