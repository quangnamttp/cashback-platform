'use client';

export type ProductPreview = { title?: string; image?: string; price?: number };

const cache = new Map<string, ProductPreview | null>();

// Set once the Cloudflare Worker at workers/product-preview is deployed and
// its URL saved to NEXT_PUBLIC_SCRAPER_WORKER_URL (.env.local locally, a
// GitHub Actions secret for production). Undefined/empty just means that
// tier is skipped — fetchProductPreview below still works via microlink.
const WORKER_URL = process.env.NEXT_PUBLIC_SCRAPER_WORKER_URL;

// workers/accesstrade-sync's own URL — same var lib/redirectLink.ts reads.
// Only used here for its D1-cached /resolve-shortlink route (see
// resolveShortlink below); duplicated rather than imported to avoid a
// circular import (redirectLink.ts already imports FROM this file).
const ACCESSTRADE_WORKER_URL = process.env.NEXT_PUBLIC_ACCESSTRADE_WORKER_URL;

/**
 * Tier 1 — our own scraper (see workers/product-preview). Follows
 * shortlink redirects (s.shopee.vn) itself and reads the real page's
 * og:title/og:image/JSON-LD, including price when the page's own
 * structured data has one — something the generic microlink fallback
 * below never attempts. Returns null on any failure (worker not deployed,
 * network error, page didn't have the data) so the caller always has a
 * next tier to fall back to.
 */
async function fetchFromWorker(productUrl: string): Promise<ProductPreview | null> {
  if (!WORKER_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${WORKER_URL}?url=${encodeURIComponent(productUrl)}`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.title && !json.image) return null;
    return {
      title: json.title || undefined,
      image: json.image || undefined,
      price: typeof json.price === 'number' && json.price > 0 ? json.price : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Tier 2 fallback — microlink.io runs the same kind of fetch on THEIR
 * server and hands back og:title/og:image as JSON with permissive CORS
 * headers, so this still works even with no Worker configured. It's free
 * and keyless for normal usage volume, but it's a third-party service we
 * don't control (can be slow/rate-limited) and has no shortlink-follow or
 * price extraction of its own — used only when the Worker tier above
 * didn't return anything.
 */
async function fetchFromMicrolink(productUrl: string): Promise<ProductPreview | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(productUrl)}&video=false`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`microlink ${res.status}`);
    const json = await res.json();
    if (json.status !== 'success') throw new Error('microlink non-success');

    const image = json.data?.image?.url || undefined;
    // Shopee's product pages never hand microlink a real per-product
    // og:image (confirmed: every Shopee product URL comes back with
    // image:null) and its title falls back to the generic site-wide
    // "Shopee Việt Nam | Hot Deals..." shell rather than the actual
    // product name — so a missing image is a reliable signal the whole
    // response is that generic shell, not real product data. Surfacing
    // it (title alone, or worse, a random logo/cert badge as the
    // "photo") would be actively misleading, so treat it as a failed
    // preview and let the caller fall back to the platform icon.
    if (!image) return null;

    return { title: json.data?.title || undefined, image };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const SHORTLINK_PATTERNS = [
  /^https?:\/\/s\.shopee\.vn\//i,
  /^https?:\/\/vt\.tiktok\.com\//i,
  /^https?:\/\/(vi-vn\.|vm\.)?tiktok\.com\/t\//i,
  /^https?:\/\/c\.la\.lazada\.(vn|com)\//i,
  // Lazada's real share-link domain (confirmed live 2026-09-09) —
  // s.lazada.vn, distinct from c.la.lazada.vn above (both real, Lazada
  // apparently issues both forms). Missing this meant isShortlink()
  // never recognized it, so a pasted s.lazada.vn link skipped resolution
  // entirely and failed hasProductIdSignature (no digits in the short
  // code itself) — always reported as "invalid_link" even for a
  // perfectly real product share.
  /^https?:\/\/s\.lazada\.(vn|com)\//i,
];

/** True for a share/shortlink URL (s.shopee.vn, vt.tiktok.com, ...) — one
 * that needs resolving to its real product URL before it means anything
 * (see resolveShortlink below). A canonical product URL never matches. */
export function isShortlink(productUrl: string): boolean {
  return SHORTLINK_PATTERNS.some((re) => re.test(productUrl));
}

export type ShortlinkResolution = { resolvedUrl: string; title?: string; image?: string; price?: number };

const SHOPEE_SHORTLINK_PATTERN = /^https:\/\/s\.shopee\.vn\//i;

// Shopee only — routes through workers/accesstrade-sync's own D1-cached
// /resolve-shortlink instead of workers/product-preview, so a repeated
// paste of the same real short link (confirmed live 2026-09-11: 0.27s-4s,
// dominated by Shopee's own redirect response time) skips that network
// round-trip entirely on a cache hit. No title/image either way — same
// tradeoff already accepted for `fast=1` below, D1/ACCESSTRADE-datafeed
// data supersedes it moments later regardless. Falls back to the plain
// product-preview path (same as every other platform) if
// NEXT_PUBLIC_ACCESSTRADE_WORKER_URL isn't configured, rather than failing
// short-link resolution outright.
async function resolveShopeeShortlinkCached(productUrl: string): Promise<ShortlinkResolution | null> {
  if (!ACCESSTRADE_WORKER_URL) return resolveShortlinkViaScraperWorker(productUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${ACCESSTRADE_WORKER_URL}/resolve-shortlink?url=${encodeURIComponent(productUrl)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json.resolvedUrl !== 'string') return null;
    return { resolvedUrl: json.resolvedUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves a share/shortlink to its real product URL — Shopee routes
 * through the D1-cached workers/accesstrade-sync endpoint above, every
 * other platform through workers/product-preview's full scrape (see
 * resolveShortlinkViaScraperWorker below for exactly why). MUST be called
 * (and its result used, not the original shortlink) before generating a
 * tracking link for one of these — normalizeProductUrl in lib/redirectLink.ts
 * only strips/appends query params, it doesn't follow redirects, so
 * sending a bare shortlink to ACCESSTRADE's create-link instead of the
 * real product URL produces a link the marketplace can't attribute a
 * purchase against. Returns null if resolution isn't configured or failed
 * — caller should fall back to the original (unresolved) URL rather than
 * block link creation entirely.
 */
export async function resolveShortlink(productUrl: string): Promise<ShortlinkResolution | null> {
  if (SHOPEE_SHORTLINK_PATTERN.test(productUrl)) {
    return resolveShopeeShortlinkCached(productUrl);
  }
  return resolveShortlinkViaScraperWorker(productUrl);
}

// Lazada/TikTok Shop short links — unchanged path via workers/
// product-preview's full scrape (title/image still useful there, since
// neither platform has a D1/live-datafeed price source the way Shopee now
// does — see get-cashback-link/page.tsx's productInfo priority order).
async function resolveShortlinkViaScraperWorker(productUrl: string): Promise<ShortlinkResolution | null> {
  if (!WORKER_URL) return null;
  // `fast=1` — see workers/product-preview's own comment on this flag.
  // This function's only real job is finding the canonical product URL
  // before generating a tracking link; the Worker's own canonical
  // re-fetch (needed only to recover title/image for Shopee's /opaanlp/
  // landing shape) measured live as the dominant cost of resolving a real
  // short link (2.1s-5.1s total). Skipping it here doesn't lose anything
  // this function's own callers depend on — title/image, when set, is
  // only ever a placeholder shown until the real D1/ACCESSTRADE-datafeed
  // data arrives, which already takes priority over it once it does (see
  // get-cashback-link/page.tsx's productInfo).
  const controller = new AbortController();
  // Was 8000 — measured live 2026-09-11 against a real s.shopee.vn link:
  // the Worker's own chain for THIS domain is two sequential upstream
  // fetches (follow the short-link redirect, then re-fetch the canonical
  // /product/<id>/<id> page for real og:title/image — see workers/
  // product-preview's own comment on why /opaanlp/ needs that second hop),
  // timed cold at 4.3s-5.1s from a low-latency connection alone. A mobile
  // connection's extra RTT/TLS overhead on top of that regularly pushed
  // the real total past 8000ms, aborting a resolve that would otherwise
  // have succeeded a moment later — surfacing as reason:'resolve_error'
  // ("Không thể tạo liên kết...") on a link that was never actually
  // broken, just slow. 15000 keeps a real ceiling (still fails, same
  // honest fallback, if the Worker/Shopee is genuinely unreachable) while
  // giving real cold resolves enough room to finish.
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${WORKER_URL}?url=${encodeURIComponent(productUrl)}&fast=1`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json.resolvedUrl !== 'string') return null;
    return {
      resolvedUrl: json.resolvedUrl,
      title: typeof json.title === 'string' ? json.title : undefined,
      image: typeof json.image === 'string' ? json.image : undefined,
      price: typeof json.price === 'number' && json.price > 0 ? json.price : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort REAL product title/thumbnail/price for a pasted marketplace
 * link — tries the Worker scraper first, falls back to microlink. Every
 * caller MUST treat a null return as normal and fall back to the platform
 * icon + a generic product label — never block the flow waiting on this.
 */
export async function fetchProductPreview(productUrl: string): Promise<ProductPreview | null> {
  const cached = cache.get(productUrl);
  if (cached !== undefined) return cached;

  const preview = (await fetchFromWorker(productUrl)) || (await fetchFromMicrolink(productUrl));
  cache.set(productUrl, preview);
  return preview;
}

// Shopee/Lazada/TikTok Shop product URLs almost always carry the product
// name as a URL-encoded slug in the path (e.g.
// ".../May-thoi-phan-luc-BS-PL2IN1-i.60913569.26989828302") — decoding that
// slug is instant, needs no network call, and never fails from a rate
// limit or a marketplace page microlink can't parse. It's a rougher label
// than a real og:title (no diacritics, since marketplaces strip them from
// slugs), but it's ALWAYS available the instant a link is pasted, so it's
// used as the immediate title while fetchProductPreview above tries for a
// better one in the background.
export function extractProductNameFromUrl(productUrl: string): string | undefined {
  try {
    const url = new URL(productUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    let slug = segments[segments.length - 1] || '';
    slug = decodeURIComponent(slug);
    slug = slug.replace(/-i\.\d+\.\d+$/, ''); // Shopee: "...-i.<shopid>.<itemid>"
    slug = slug.replace(/-i\d+-s\d+(\.html)?$/i, ''); // Lazada: "...-i<id>-s<id>.html"
    slug = slug.replace(/\.html$/i, '');
    slug = slug.replace(/[-_]+/g, ' ').trim();
    if (!slug || slug.length < 3 || /^\d+$/.test(slug)) return undefined;
    return slug;
  } catch {
    return undefined;
  }
}
