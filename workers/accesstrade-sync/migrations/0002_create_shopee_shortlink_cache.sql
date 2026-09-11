-- Migration number: 0002 	 2026-09-11T14:35:01.501Z

-- Caches the resolve result of a Shopee share short-link (s.shopee.vn/<code>)
-- so a repeated paste of the SAME short link skips the real network
-- round-trip to Shopee (measured live 2026-09-11: 0.27s-4s, high variance,
-- dominated by Shopee's own redirect response time, not anything on our
-- side). id is the short link's origin+pathname (its query string, e.g.
-- share_channel_code, only describes HOW it was shared, not WHICH product —
-- stripped before hashing so two share events of the same code hit the
-- same cache row). Never written to by the customer-facing /create-link
-- path directly — only by resolveShopeeShortlinkCached's own miss path.
CREATE TABLE IF NOT EXISTS shopee_shortlink_cache (
  id TEXT PRIMARY KEY,        -- origin+pathname of the short URL, e.g. "https://s.shopee.vn/AAH4zXTsg8"
  short_url TEXT NOT NULL,
  resolved_url TEXT NOT NULL,
  shop_id TEXT,
  item_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL  -- created_at + 30 days; a stale/expired row is simply re-resolved and overwritten, never left to silently serve outdated data
);
