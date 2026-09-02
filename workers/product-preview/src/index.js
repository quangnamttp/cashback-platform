// Real product-page scraper for hoantiendv's static site (Firebase Hosting
// Spark plan has no server of its own, so this runs as a separate, free
// Cloudflare Worker instead). Given a Shopee/Lazada/TikTok Shop URL —
// including a shortlink like s.shopee.vn — it follows redirects, reads the
// page's own og:title/og:image (and JSON-LD Product data when present) and
// hands back {title, image, price}. Restricted to a fixed marketplace host
// allowlist so this can't be used as an open URL-fetch proxy for anything
// else.

const ALLOWED_HOST_PATTERNS = [
  /(^|\.)shopee\.(vn|com)$/i,
  /(^|\.)s\.shopee\.vn$/i,
  /(^|\.)lazada\.(vn|com)$/i,
  /(^|\.)tiktok\.com$/i,
];

function isAllowedHost(hostname) {
  return ALLOWED_HOST_PATTERNS.some((re) => re.test(hostname));
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Reads <meta property="og:title|og:image"> (falling back to
// twitter:image, and product:price:amount / og:price:amount for price —
// used by some marketplaces' Facebook-ads pixel integration).
class MetaCollector {
  constructor(result) {
    this.result = result;
  }
  element(el) {
    const property = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
    const content = el.getAttribute('content');
    if (!property || !content) return;
    if (property === 'og:title' && !this.result.title) this.result.title = content;
    if ((property === 'og:image' || property === 'twitter:image') && !this.result.image) this.result.image = content;
    if ((property === 'product:price:amount' || property === 'og:price:amount') && !this.result.price) {
      const n = Number(content.replace(/[^\d.]/g, ''));
      if (n > 0) this.result.price = n;
    }
  }
}

// Reads <script type="application/ld+json"> Product structured data —
// the same schema.org markup search engines use for rich product results,
// often the most reliable source for a real price when a page has it.
class JsonLdCollector {
  constructor(result) {
    this.result = result;
    this.buffer = '';
    this.capturing = false;
  }
  element() {
    this.capturing = true;
    this.buffer = '';
  }
  text(chunk) {
    if (!this.capturing) return;
    this.buffer += chunk.text;
    if (chunk.lastInTextNode) {
      this.tryParse(this.buffer);
      this.capturing = false;
      this.buffer = '';
    }
  }
  tryParse(raw) {
    try {
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item['@type'];
        const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
        if (!isProduct) continue;
        if (!this.result.title && item.name) this.result.title = item.name;
        if (!this.result.image) {
          const img = Array.isArray(item.image) ? item.image[0] : item.image;
          if (img) this.result.image = img;
        }
        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        if (offers && !this.result.price) {
          const price = Number(offers.price || offers.lowPrice);
          if (price > 0) this.result.price = price;
        }
      }
    } catch {
      // page's JSON-LD wasn't valid/wasn't Product data — ignore, other
      // signals (meta tags) may still have resolved title/image/price.
    }
  }
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    if (!targetUrl) return jsonResponse({ error: 'missing url' }, 400);

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return jsonResponse({ error: 'invalid url' }, 400);
    }

    if (!isAllowedHost(parsed.hostname)) {
      return jsonResponse({ error: 'host not allowed' }, 403);
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        redirect: 'follow',
        headers: {
          // A real mobile browser UA — several marketplaces serve a
          // reduced/blocked page to obvious non-browser requests.
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      const result = { title: null, image: null, price: null, resolvedUrl: upstream.url };

      // TikTok Shop's product pages are a client-rendered SPA — the raw
      // HTML the fetch above sees has no server-rendered og:title/og:image
      // at all, so MetaCollector/JsonLdCollector below always come back
      // empty for tiktok.com. But TikTok's own share/redirect flow embeds
      // that exact same preview data (used for link-unfurling in chat
      // apps) as an `og_info={"title":...,"image":...}` JSON query param
      // on the URL it redirects to — read straight off resolvedUrl,
      // no HTML parsing needed. (No price field is ever present here;
      // TikTok Shop's real price is loaded by client-side JS after page
      // load, which a plain fetch() can never see — see README.)
      try {
        const resolvedParams = new URL(upstream.url).searchParams;
        const ogInfoRaw = resolvedParams.get('og_info');
        if (ogInfoRaw) {
          const ogInfo = JSON.parse(ogInfoRaw);
          if (ogInfo.title) result.title = ogInfo.title;
          if (ogInfo.image) result.image = ogInfo.image;
        }
      } catch {
        // no og_info param, or it wasn't valid JSON — fall through to HTML parsing below
      }

      await new HTMLRewriter()
        .on('meta', new MetaCollector(result))
        .on('script[type="application/ld+json"]', new JsonLdCollector(result))
        .transform(upstream)
        .text(); // drain the stream so the handlers above actually run

      return jsonResponse(result, 200);
    } catch {
      return jsonResponse({ error: 'fetch failed' }, 502);
    }
  },
};
