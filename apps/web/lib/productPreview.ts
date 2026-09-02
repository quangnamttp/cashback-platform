'use client';

export type ProductPreview = { title?: string; image?: string; price?: number };

const cache = new Map<string, ProductPreview | null>();

// Set once the Cloudflare Worker at workers/product-preview is deployed and
// its URL saved to NEXT_PUBLIC_SCRAPER_WORKER_URL (.env.local locally, a
// GitHub Actions secret for production). Undefined/empty just means that
// tier is skipped — fetchProductPreview below still works via microlink.
const WORKER_URL = process.env.NEXT_PUBLIC_SCRAPER_WORKER_URL;

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
];

/** True for a share/shortlink URL (s.shopee.vn, vt.tiktok.com, ...) — one
 * that needs resolving to its real product URL before it means anything
 * (see resolveShortlink below). A canonical product URL never matches. */
export function isShortlink(productUrl: string): boolean {
  return SHORTLINK_PATTERNS.some((re) => re.test(productUrl));
}

/**
 * Resolves a share/shortlink to its real product URL by following its
 * redirects through the Worker (same request the Worker already makes for
 * scraping — this just reads its `resolvedUrl` field). MUST be called
 * (and its result used, not the original shortlink) before generating a
 * tracking link for one of these — normalizeProductUrl/buildAffiliateUrl
 * in lib/redirectLink.ts only strip/append query params, they don't
 * follow redirects, so tagging a bare shortlink with our own tracking
 * param instead of the real product URL produces a link the marketplace
 * can't attribute a purchase against. Returns null if the Worker isn't
 * configured or the resolve failed — caller should fall back to the
 * original (unresolved) URL rather than block link creation entirely.
 */
export async function resolveShortlink(productUrl: string): Promise<string | null> {
  if (!WORKER_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${WORKER_URL}?url=${encodeURIComponent(productUrl)}`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.resolvedUrl === 'string' ? json.resolvedUrl : null;
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
