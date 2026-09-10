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

// Lazada's share-shortlink domain (s.lazada.vn) does NOT do a real HTTP
// redirect (confirmed live 2026-09-09: fetch()'s redirect:'follow' had
// nothing to follow, upstream.url came back identical to the request) —
// instead it serves an intermediate page directly, with the real
// og:title/og:image for the product ALREADY embedded (so MetaCollector
// above already picks those up correctly with zero extra work), plus a
// <meta http-equiv="refresh" content="N;url=..."> pointing at the real
// canonical product URL. That real URL is what's actually needed for
// hasProductIdSignature/ACCESSTRADE/datafeed matching downstream — a
// title+image alone isn't enough since the caller still needs a
// canonical URL with real digits in it. Reads the same way a browser
// would honor a meta-refresh, just without waiting out its delay.
class RefreshRedirectCollector {
  constructor(result) {
    this.result = result;
  }
  element(el) {
    if ((el.getAttribute('http-equiv') || '').toLowerCase() !== 'refresh') return;
    const content = el.getAttribute('content') || '';
    const m = /url=(.+)$/i.exec(content);
    if (m && !this.result.metaRefreshUrl) this.result.metaRefreshUrl = m[1].trim();
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
        .on('meta', new RefreshRedirectCollector(result))
        .on('script[type="application/ld+json"]', new JsonLdCollector(result))
        .transform(upstream)
        .text(); // drain the stream so the handlers above actually run

      // Lazada's share-shortlink page never issues a real HTTP redirect
      // (see RefreshRedirectCollector's own comment) — only a meta-refresh
      // pointing at the real product URL. Override resolvedUrl with that
      // real target so callers (hasProductIdSignature, ACCESSTRADE,
      // datafeed matching) get an actual canonical product URL instead of
      // the opaque share-link code, which has no digits/identity of its
      // own at all.
      if (result.metaRefreshUrl) {
        try {
          result.resolvedUrl = new URL(result.metaRefreshUrl, upstream.url).toString();
        } catch {
          // malformed meta-refresh target — keep the original resolvedUrl
        }
      }
      delete result.metaRefreshUrl;

      // Lazada's share-page og:title wraps the real product name in its
      // own fixed template ("Thủ tục thanh toán <name>. \nMua ngay tại
      // Lazada!" — confirmed live 2026-09-09, same wrapper text on every
      // share link) — the real name is genuinely in there, just not
      // clean, so it's stripped rather than the whole title rejected
      // (this is Lazada's own fixed wrapper, not a generic-shell/no-
      // product case like the two rejections above).
      if (result.title) {
        // A leading zero-width space/BOM-like character sometimes
        // precedes the wrapper text on real pages (confirmed live) —
        // stripped first (via explicit \u escapes, not literal invisible
        // characters in source) so the prefix regex's anchor actually
        // lines up with "Thủ tục thanh toán".
        const invisiblePrefix = new RegExp('^[\\s\\u200B\\u200C\\u200D\\uFEFF]+');
        const cleaned = result.title
          .replace(invisiblePrefix, '')
          .replace(/^Thủ tục thanh toán\s*/i, '')
          .replace(/\.\s*Mua ngay tại Lazada!\s*$/i, '')
          .trim();
        if (cleaned) result.title = cleaned;
      }

      // TikTok serves an anti-bot interstitial (title "Security Check") to
      // a plain fetch() hitting a direct shop.tiktok.com/.../pdp/<id> URL
      // that lacks the signed share-session params only present when the
      // request arrives via TikTok's own vt.tiktok.com redirect chain —
      // confirmed live 2026-09-09 (a customer can paste either form: a
      // fresh share link, or a URL copied straight from their own address
      // bar/app, which has no such params). That interstitial has its own
      // real og:title/og:image, so MetaCollector above picks them up as if
      // they were the product's — caught here and treated as a failed
      // scrape (both nulled) so the caller falls back to its own local
      // slug-derived title instead of showing "Security Check" + a random
      // stock photo as if it were the real product.
      if (result.title === 'Security Check') {
        result.title = null;
        result.image = null;
      }

      // Shopee's own generic site-wide shell (homepage/search chrome) has
      // a REAL og:title AND a real og:image (its homepage banner) — unlike
      // the other generic-shell cases already handled, both fields are
      // genuinely non-null, so the usual "title with no image = fake"
      // signal doesn't catch it. Confirmed live 2026-09-09: a real
      // s.shopee.vn short link that failed to actually redirect anywhere
      // (upstream.url === the input, no 301/302 followed — this specific
      // code may be expired/app-only) served this exact title + its
      // homepage banner image, which then got shown to a customer as if
      // it were their product's own name/photo. Matched by exact text
      // (this is Shopee's fixed site title, not a per-page value) rather
      // than a fuzzy check, to never risk rejecting a real product whose
      // name happens to share a word with it.
      if (result.title === 'Shopee Việt Nam | Mua và Bán Trên Ứng Dụng Di Động Hoặc Website') {
        result.title = null;
        result.image = null;
      }

      return jsonResponse(result, 200);
    } catch {
      return jsonResponse({ error: 'fetch failed' }, 502);
    }
  },
};
