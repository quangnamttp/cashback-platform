-- Migration number: 0001 	 2026-09-11T12:05:29.877Z

-- D1 index for Shopee product price/name/image/discount, replacing the
-- old per-request CSV download+scan in lookupDatafeedProduct() (measured
-- live 2026-09-11: up to ~4s on a miss). Key is "<shopId>_<itemId>" —
-- the SAME identity already used elsewhere in this Worker (see
-- extractShopeeIds/shopeeProductId in handleCreateLink), not a new
-- concept of "product". Populated by the hourly rebuildDatafeedIndex()
-- cron; the customer-facing /create-link path only ever reads this
-- table, never writes it.
CREATE TABLE IF NOT EXISTS shopee_products (
  id TEXT PRIMARY KEY,       -- "<shopId>_<itemId>"
  name TEXT,
  price REAL,
  discount REAL,
  image TEXT,
  updated_at INTEGER NOT NULL  -- Date.now() at the time this row was last (re)written by a rebuild
);
