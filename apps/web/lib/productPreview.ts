'use client';

export type ProductPreview = { title?: string; image?: string };

const cache = new Map<string, ProductPreview | null>();

/**
 * Best-effort REAL product title/thumbnail for a pasted marketplace link.
 * There's no backend on this project (Firebase Spark plan, static export),
 * so we can't fetch+parse the marketplace's own HTML ourselves — a browser
 * fetch() straight to shopee.vn/lazada.vn is blocked cross-origin (CORS).
 *
 * microlink.io runs that fetch on THEIR server and hands back the page's
 * og:title/og:image as JSON with permissive CORS headers — so this is a
 * plain client-side fetch to a public API, not a backend of ours. It's
 * free and keyless for normal usage volume, but it's a third-party
 * service we don't control: it can be slow, rate-limited, or simply have
 * no preview for a given link. Every caller MUST treat a null return as
 * normal and fall back to the platform icon + a generic product label —
 * never block the flow waiting on this.
 */
export async function fetchProductPreview(productUrl: string): Promise<ProductPreview | null> {
  const cached = cache.get(productUrl);
  if (cached !== undefined) return cached;

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
    if (!image) {
      cache.set(productUrl, null);
      return null;
    }

    const preview: ProductPreview = {
      title: json.data?.title || undefined,
      image,
    };
    cache.set(productUrl, preview);
    return preview;
  } catch {
    cache.set(productUrl, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
